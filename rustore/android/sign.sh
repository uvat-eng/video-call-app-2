#!/bin/sh
# Подписать готовую сборку ключом RuStore (нужна только Java 17):
#   KS_PASS=ваш_пароль sh rustore/android/sign.sh
set -e
cd "$(dirname "$0")"
: "${KS_PASS:?укажите пароль от ключа: KS_PASS=... sh sign.sh}"
KS_PASS="$KS_PASS" java -cp apksig.jar Sign.java ../keys/ruchat-release.jks ../RuChat-1.2.0-unsigned.apk ../RuChat-1.2.0.apk
echo "Готово: rustore/RuChat-1.2.0.apk — загрузите его в RuStore"
