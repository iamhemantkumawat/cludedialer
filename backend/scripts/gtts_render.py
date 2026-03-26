#!/usr/bin/env python3
import argparse
import os
import sys

from gtts import gTTS


def main() -> int:
    parser = argparse.ArgumentParser(description="Render gTTS audio to an MP3 file.")
    parser.add_argument("--text", required=True, help="Text to synthesize")
    parser.add_argument("--lang", required=True, help="gTTS language code")
    parser.add_argument("--tld", required=True, help="Google TLD / accent host")
    parser.add_argument("--output", required=True, help="Output MP3 path")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    tts = gTTS(text=args.text, lang=args.lang, tld=args.tld, slow=False)
    tts.save(args.output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise
