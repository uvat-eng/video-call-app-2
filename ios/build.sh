#!/bin/bash
set -euo pipefail

TEAM=V6K9GBPFD9
BUILD_NUMBER="${GITHUB_RUN_NUMBER:-1}"

test -n "${ASC_KEY_ID:-}" || { echo "Пустой секрет ASC_KEY_ID"; exit 1; }
test -n "${ASC_ISSUER_ID:-}" || { echo "Пустой секрет ASC_ISSUER_ID"; exit 1; }
test -n "${ASC_KEY_P8:-}" || { echo "Пустой секрет ASC_KEY_P8"; exit 1; }

X=$(ls -d /Applications/Xcode_2[6-9]*.app | grep -vi beta | sort -V | tail -1)
sudo xcode-select -s "$X"
xcodebuild -version

KEY="$HOME/private_keys/AuthKey_$ASC_KEY_ID.p8"
mkdir -p "$HOME/private_keys"
printf '%s' "$ASC_KEY_P8" > "$KEY"

TMP="${RUNNER_TEMP:-/tmp}"
ARCHIVE="$TMP/RuChat.xcarchive"

cd "$(dirname "$0")"

echo "=== Сборка архива ==="
xcodebuild archive -project RuChat.xcodeproj -scheme RuChat -configuration Release \
  -destination generic/platform=iOS -archivePath "$ARCHIVE" \
  DEVELOPMENT_TEAM=$TEAM CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION=$BUILD_NUMBER

echo "=== Загрузка в App Store Connect ==="
P="$TMP/export.plist"
rm -f "$P"
/usr/libexec/PlistBuddy -c "Add :method string app-store-connect" "$P"
/usr/libexec/PlistBuddy -c "Add :destination string upload" "$P"
/usr/libexec/PlistBuddy -c "Add :teamID string $TEAM" "$P"
/usr/libexec/PlistBuddy -c "Add :signingStyle string automatic" "$P"

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$P" \
  -exportPath "$TMP/out" -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

echo "=== Готово: сборка отправлена в App Store Connect ==="
