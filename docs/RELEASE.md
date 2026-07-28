# Release v0.2.0 (manual steps)

If GitHub Actions is unavailable, publish locally:

```bash
bash scripts/install-tauri-linux-deps.sh
npm install
npm run tauri build
```

Create the tag and GitHub release:

```bash
git tag -a v0.2.0 -m "Expense Tracker 0.2.0"
git push origin v0.2.0
gh release create v0.2.0 \
  src-tauri/target/release/bundle/deb/*.deb \
  src-tauri/target/release/bundle/appimage/*.AppImage \
  --title "v0.2.0" \
  --notes-file CHANGELOG.md
```

Run [SMOKE_TEST.md](SMOKE_TEST.md) before publishing (`bash scripts/smoke-test.sh` for automated checks).
