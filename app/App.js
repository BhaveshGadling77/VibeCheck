import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from './config';

function MainApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('login'); // 'login' | 'register' | 'listen' | 'history'

  // Auth state
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Audio & recognition state
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(6);
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('token');
        const savedUser = await AsyncStorage.getItem('user_name');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setCurrentUser(savedUser);
          setTab('listen');
        }
      } catch (err) {
        console.error('Session load error:', err);
      }
    })();
  }, []);

  // ---------------------------------------------------------------------------
  // AUTHENTICATION
  // ---------------------------------------------------------------------------
  const handleRegister = async () => {
    if (!firstName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'First name, email, and password are required.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errDetail = typeof data.detail === 'string'
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map(d => `${d.loc.slice(-1)}: ${d.msg}`).join('\n')
            : JSON.stringify(data);
        throw new Error(errDetail);
      }

      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user_name', data.name);
      setToken(data.token);
      setCurrentUser(data.name);
      setPassword('');
      setTab('listen');
    } catch (err) {
      Alert.alert('Registration Error', err.message);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Enter your email and password.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errDetail = typeof data.detail === 'string'
          ? data.detail
          : JSON.stringify(data.detail || data);
        throw new Error(errDetail);
      }

      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user_name', data.name);
      setToken(data.token);
      setCurrentUser(data.name);
      setPassword('');
      setTab('listen');
    } catch (err) {
      Alert.alert('Login Failed', err.message);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user_name');
    setToken(null);
    setCurrentUser(null);
    setTab('login');
    setRecognitionResult(null);
  };

  // ---------------------------------------------------------------------------
  // AUDIO RECORDING & UPLOAD
  // ---------------------------------------------------------------------------
  const handleStartListening = async () => {
    try {
      setRecognitionResult(null);
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Microphone permission is required.');
        return;
      }

      setIsRecording(true);
      setRecordingCountdown(6);

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      const timer = setInterval(() => {
        setRecordingCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setTimeout(async () => {
        try {
          await audioRecorder.stop();
          setIsRecording(false);
          const uri = audioRecorder.uri;
          if (uri) {
            uploadAudio(uri);
          }
        } catch (stopErr) {
          console.error('Stop error:', stopErr);
          setIsRecording(false);
        }
      }, 6000);

    } catch (err) {
      setIsRecording(false);
      Alert.alert('Audio Error', err.message);
    }
  };

  const uploadAudio = async (uri) => {
    setIsProcessing(true);
    try {
      const response = await FileSystem.uploadAsync(`${API_URL}/api/recognize`, uri, {
        fieldName: 'audio',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        mimeType: 'audio/m4a',
      });

      const data = JSON.parse(response.body);

      if (response.status < 200 || response.status >= 300) {
        const msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data);
        throw new Error(msg);
      }

      setRecognitionResult(data);
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Recognition Failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HISTORY
  // ---------------------------------------------------------------------------
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/api/history`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load history.');
      setHistoryItems(data);
    } catch (err) {
      Alert.alert('History Error', err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (tab === 'history' && token) {
      fetchHistory();
    }
  }, [tab]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" translucent />

      {/* Top Header with Inset Spacing */}
      <View style={styles.header}>
        <Text style={styles.brand}>VIBE<Text style={styles.brandAccent}>CHECK</Text></Text>
        {token && (
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>
        {/* LOGIN SCREEN */}
        {tab === 'login' && (
          <View style={styles.authCard}>
            <Text style={styles.title}>Sign In</Text>
            <Text style={styles.subtitle}>Enter your email to access your library</Text>

            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
              <Text style={styles.btnText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setTab('register')} style={styles.switchAuth}>
              <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Sign Up</Text></Text>
            </TouchableOpacity>
          </View>
        )}

        {/* REGISTER SCREEN */}
        {tab === 'register' && (
          <View style={styles.authCard}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Register to start identifying music</Text>

            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor="#64748b"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Last name (optional)"
              placeholderTextColor="#64748b"
              value={lastName}
              onChangeText={setLastName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister}>
              <Text style={styles.btnText}>Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setTab('login')} style={styles.switchAuth}>
              <Text style={styles.linkText}>Already registered? <Text style={styles.linkBold}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        )}

        {/* RECOGNITION SCREEN */}
        {tab === 'listen' && (
          <View style={styles.listenContainer}>
            <Text style={styles.welcomeUser}>Hi, <Text style={styles.usernameBold}>{currentUser}</Text></Text>

            <View style={styles.circleContainer}>
              <TouchableOpacity
                style={[styles.bigCircle, isRecording && styles.bigCircleActive]}
                disabled={isRecording || isProcessing}
                onPress={handleStartListening}
              >
                {isProcessing ? (
                  <ActivityIndicator size="large" color="#ffffff" />
                ) : (
                  <Text style={styles.circleText}>
                    {isRecording ? `${recordingCountdown}s` : 'VIBE'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.statusLabel}>
              {isRecording
                ? 'Listening to background music...'
                : isProcessing
                ? 'Querying B-Tree fingerprint index in PostgreSQL...'
                : 'Tap circle to listen'}
            </Text>

            {recognitionResult && (
              <View style={styles.resultCard}>
                {recognitionResult.match_found ? (
                  <>
                    <Text style={styles.matchBadge}>MATCH FOUND</Text>
                    <Text style={styles.songTitle}>{recognitionResult.song?.title}</Text>
                    <Text style={styles.songArtist}>
                      {Array.isArray(recognitionResult.song?.artists)
                        ? recognitionResult.song.artists.join(', ')
                        : recognitionResult.song?.artists || 'Unknown Artist'}
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaPill}>
                        {Array.isArray(recognitionResult.song?.genres)
                          ? recognitionResult.song.genres.join(', ')
                          : recognitionResult.song?.genres || 'Music'}
                      </Text>
                      <Text style={styles.metaPill}>{recognitionResult.confidence}% match</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.noMatchBadge}>NO MATCH</Text>
                    <Text style={styles.noMatchText}>
                      {recognitionResult.reason || 'No matching acoustic fingerprint found.'}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* HISTORY SCREEN */}
        {tab === 'history' && (
          <View style={styles.historyContainer}>
            <Text style={styles.historyHeading}>Identification History</Text>
            {isLoadingHistory ? (
              <ActivityIndicator size="large" color="#38bdf8" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={historyItems}
                keyExtractor={(item) => item.history_id.toString()}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No recognitions saved yet.</Text>
                }
                renderItem={({ item }) => (
                  <View style={styles.historyCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histSong}>{item.title}</Text>
                      <Text style={styles.histArtist}>
                        {Array.isArray(item.artists) ? item.artists.join(', ') : item.artists}
                      </Text>
                      <Text style={styles.histDate}>
                        {new Date(item.recognized_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(item.recognized_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.histBadge}>
                      <Text style={styles.histBadgeText}>
                        {item.genres?.[0] || 'Track'}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        )}
      </View>

      {/* Dynamic Bottom Navigation Bar with Inset Padding */}
      {token && (
        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.navItem, tab === 'listen' && styles.navItemActive]}
            onPress={() => setTab('listen')}
          >
            <Text style={[styles.navText, tab === 'listen' && styles.navTextActive]}>Identify</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navItem, tab === 'history' && styles.navItemActive]}
            onPress={() => setTab('history')}
          >
            <Text style={[styles.navText, tab === 'history' && styles.navTextActive]}>History</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 10 : 0,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#ffffff',
  },
  brandAccent: {
    color: '#38bdf8',
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  authCard: {
    backgroundColor: '#111827',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchAuth: {
    marginTop: 18,
    alignItems: 'center',
  },
  linkText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  linkBold: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  listenContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  welcomeUser: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 26,
  },
  usernameBold: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  circleContainer: {
    marginVertical: 16,
  },
  bigCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#0284c7',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 12,
  },
  bigCircleActive: {
    backgroundColor: '#ef4444',
  },
  circleText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 15,
    marginTop: 18,
    textAlign: 'center',
  },
  resultCard: {
    marginTop: 26,
    width: '100%',
    backgroundColor: '#111827',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
  },
  matchBadge: {
    color: '#34d399',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  noMatchBadge: {
    color: '#f87171',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  songTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  songArtist: {
    color: '#94a3b8',
    fontSize: 15,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  metaPill: {
    backgroundColor: '#1e293b',
    color: '#38bdf8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: '600',
  },
  noMatchText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  historyContainer: {
    flex: 1,
    paddingTop: 10,
  },
  historyHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 10,
  },
  histSong: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  histArtist: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 2,
  },
  histDate: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  histBadge: {
    backgroundColor: '#1e293b',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  histBadgeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0b0f19',
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#38bdf8',
  },
  navText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
});