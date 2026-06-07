# X Profile Sorter

Enter an X handle, choose a time range, then sort recent posts into:

- video creation
- Monad
- AI & vibecode
- NFT & GameFi
- crypto

## Run

1. Copy `.env.example` to `.env.local`
2. Add `TWITTERAPI_KEY`
3. Optional: add `OPENAI_API_KEY` to enable the hybrid OpenAI classifier
4. Run:

```bash
npm start
```

Open http://localhost:4310

## Classification

The app uses hard keyword rules first for obvious skips, video, and Monad. If `OPENAI_API_KEY` is present, it batch-classifies ambiguous tweets with `OPENAI_CLASSIFIER_MODEL` (`gpt-5.4-nano` by default). If OpenAI fails or is disabled, it falls back to local keyword scoring.

Results are cached locally in `.cache/`:

- raw tweets: `handle + range`, 12 hour TTL
- classifications: `handle + range + categories + classifier version`, 24 hour TTL
