"""Landmark-based audio fingerprinting (Low-Memory Optimized)."""
import os
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

import io
import gc
import numpy as np
from pydub import AudioSegment
from scipy.ndimage import maximum_filter

# Downsample to 11025 Hz (captures up to ~5.5 kHz, which is more than enough for music recognition
# and halves the memory consumption compared to 22050 Hz)
SR = 11025
NFFT = 1024
HOP = 512
PEAK_NEIGHBORHOOD = (15, 15)    # (freq bins, time frames)
AMP_MIN_DB = -50                # filter out low-energy background noise
FAN_OUT = 8
DT_MIN, DT_MAX = 1, 150         # frame deltas

def load_audio(source):
    """Load audio, convert to mono, downsample to SR, and return 1D float32 array."""
    seg = AudioSegment.from_file(io.BytesIO(source) if isinstance(source, bytes) else source)
    seg = seg.set_channels(1).set_frame_rate(SR)
    
    # Extract raw samples
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    norm = float(1 << (8 * seg.sample_width - 1))
    return samples / norm

def find_peaks(x):
    """Compute spectrogram and find 2D local peaks with minimal RAM allocation."""
    n_frames = (len(x) - NFFT) // HOP + 1
    if n_frames <= 0:
        return []

    # Use strided windows to avoid copying memory
    window = np.hanning(NFFT).astype(np.float32)
    
    # Compute FFT frame by frame to keep memory footprint minimal
    num_bins = NFFT // 2 + 1
    S = np.empty((num_bins, n_frames), dtype=np.float32)

    for i in range(n_frames):
        start = i * HOP
        frame = x[start:start + NFFT] * window
        fft_mag = np.abs(np.fft.rfft(frame))
        S[:, i] = fft_mag

    del x
    gc.collect()

    # Convert to log scale (dB)
    S += 1e-6
    np.log10(S, out=S)
    S *= 20.0
    S -= S.max()

    # Find 2D local maxima
    local_max = maximum_filter(S, size=PEAK_NEIGHBORHOOD) == S
    mask = local_max & (S > AMP_MIN_DB)
    
    del S, local_max
    gc.collect()

    fi, ti = np.nonzero(mask)
    order = np.argsort(ti, kind="stable")
    return [(int(ti[i]), int(fi[i])) for i in order]

def make_hashes(peaks):
    """Pair each anchor peak with future peaks within a target window."""
    out = []
    for i, (t1, f1) in enumerate(peaks):
        n = 0
        for (t2, f2) in peaks[i + 1:i + 1 + 35]:
            dt = t2 - t1
            if DT_MIN <= dt <= DT_MAX and f1 < 1024 and f2 < 1024:
                # 32-bit integer: (f1 << 20) | (f2 << 10) | dt
                out.append(((f1 << 20) | (f2 << 10) | dt, t1))
                n += 1
                if n >= FAN_OUT:
                    break
    return out

def fingerprint(source):
    peaks = find_peaks(load_audio(source))
    return make_hashes(peaks)