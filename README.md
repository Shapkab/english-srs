# English SRS

A spaced-repetition learning app for English, built on Next.js +
Supabase + OpenAI.

## Where the code lives

The Next.js app lives in [`english-srs-mvp/`](english-srs-mvp/). All
package manifests, migrations, and source code are inside that
subdirectory; the repository root deliberately holds no `package.json`.

For setup, environment variables, scripts, and deployment notes:

```bash
cd english-srs-mvp
cat README.md
```

## Deployment note

When deploying to Vercel, the project's **Root Directory** setting
must be `english-srs-mvp`, since that is where the Next.js app and
its `package.json` live. See
[`english-srs-mvp/README.md`](english-srs-mvp/README.md) for the
full deployment checklist.
