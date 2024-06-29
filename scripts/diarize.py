from pyannote.audio import Pipeline # pip install pyannote.audio
from pathlib import Path
import os

CUR_DIR = Path(__file__).parent

# 1. Accept conditions in:
# https://hf.co/pyannote/segmentation-3.0
# https://hf.co/pyannote/speaker-diarization-3.1

pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
	# 2. Get token from https://huggingface.co/settings/tokens 
	# export HK_TOKEN="<token>"
    use_auth_token=os.getenv('HF_TOKEN')
) 

# send pipeline to GPU (when available)
import torch
device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
print("Using device", device)
pipeline.to(torch.device(device))

# apply pretrained pipeline
diarization = pipeline(str(CUR_DIR / "../samples/multi.wav"))

# print the result
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"start={turn.start:.1f}s stop={turn.end:.1f}s speaker_{speaker}")
