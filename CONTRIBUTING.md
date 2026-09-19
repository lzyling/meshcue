# Working on MeshCue

One person develops this, so the rules below are the smallest set that keeps
two promises: `main` is always something that was released, and work that turns
out to be a bad idea can be thrown away without unpicking it.

## Branches

| Branch | What it means |
| ------ | ------------- |
| `main` | What has been released. Every commit on it is inside a published release. |
| `dev`  | Where work happens. The default branch to start from and to push to. |

`main` is only ever **fast-forwarded from `dev`**, and the tag goes on straight
afterwards. Nothing is committed to `main` directly — that is what keeps the two
from drifting apart rather than a rule anyone has to remember.

Work that might not be kept gets its own branch off `dev`, named for what it is
trying (`try/shadow-plane`). If it works it merges into `dev`; if it does not it
is deleted, and `dev` never knew about it.

## Versions

`package.json` on `dev` carries the version being worked towards with a `-dev`
suffix — `1.1.1-dev`. The number after the suffix is a placeholder, not a
promise: a batch that turns out to change the interface becomes a minor instead,
and the release commit is where that is decided.

The suffix is there so a build handed to someone to try says what it is. A
development build that reports the last released version is the same kind of
lie as a document that states a test count nobody has checked since.

The release commit is the last commit on `dev` before the fast-forward, and it
does three things together:

1. drops the `-dev` suffix across `package.json`, `package-lock.json`,
   `adapters/openclaw/package.json` and `adapters/openclaw/openclaw.plugin.json`
2. points the install lines in `README.md` and `AGENT-INTERFACE.md` at the tag
   about to exist
3. nothing else

`tests/docs.test.mjs` holds both halves of that: on a released version the
documented tag must equal it, and on a `-dev` version the documented tag must
*not* be the one being worked towards — because that tag does not exist yet, and
a reader who follows it gets nothing.

## Releasing

```sh
git switch main && git merge --ff-only dev
git tag -a vX.Y.Z -F - <<< "…"   # the annotation becomes the release notes
git push origin main vX.Y.Z
```

`.github/workflows/release.yml` triggers on `v*` tags and nothing else, so no
branch can publish by accident. The release notes are the tag's annotation
verbatim; the workflow appends the commit it was cut from.

Read the notes back afterwards. The two lines above have both been wrong before,
and a release is the only place they can be checked.

## What runs where

CI runs on every push to any branch and on pull requests, so a branch is covered
from its first commit. Before a release, run the parts CI does not:

```sh
npm run build:integration -- tmp/<candidate>/package
npm run test:package -- tmp/<candidate>/package
```
