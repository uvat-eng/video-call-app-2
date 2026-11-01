#!/bin/sh
# Сборка APK без Android Studio. Нужны: JDK 17, Android build-tools 35, platform android-35.
# Использование: SDK=/путь/к/sdk BT=$SDK/build-tools/35.0.0 sh build.sh
set -e
cd "$(dirname "$0")"
: "${SDK:?укажите SDK}"; : "${BT:=$SDK/build-tools/35.0.0}"
JAR=$SDK/platforms/android-35/android.jar
rm -rf build && mkdir -p build/classes build/dex
$BT/aapt2 compile --dir res -o build/res.zip
$BT/aapt2 link -o build/base.apk -I $JAR --manifest AndroidManifest.xml --java build/gen build/res.zip --auto-add-overlay
javac -source 17 -target 17 -classpath $JAR -d build/classes build/gen/su/rusapp/ruchat/R.java src/su/rusapp/ruchat/*.java
$BT/d8 --release --min-api 26 --lib $JAR --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unsigned.apk && (cd build/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -f -p 4 build/unsigned.apk build/aligned.apk
$BT/apksigner sign --ks "${KEYSTORE:-ruchat-release.jks}" --ks-pass "pass:${KS_PASS:?укажите пароль}" --out ../RuChat-1.0.0.apk build/aligned.apk
echo "Готово: rustore/RuChat-1.0.0.apk"
