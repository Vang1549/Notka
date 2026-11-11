# APK 0.62 · Своя иконка

Добавлена системная иконка «Нотки»: светло-зелёная нота, совмещённая с клавишами пианино, на тёмном фоне. Исходное изображение art/notka-icon.png создано встроенным генератором изображений. Оно отображается в Android вместо стандартной иконки приложения; значки внутри редактора и выбранная пользователем тема не меняются.

build-icon.py создаёт PNG 48/72/96/144/192 px для mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi и компилирует Android-ресурсы официальным AAPT2, закреплённым URL и SHA-256 в native-tools.json. Сборка требует Pillow дополнительно к прежним зависимостям. android:icon ссылается на mipmap/ic_launcher. Таблица resources.arsc хранится без сжатия с выравниванием 4 байта, необходимым на Android 11+. Перепаковка выполняется до подписания APK, старые версии и ключ подписи сохраняются.

Проверено: сборка Java/DEX, подпись и манифест APK, ссылка иконки, наличие и размеры всех пяти PNG, сжатие/выравнивание таблицы ресурсов; официальный aapt2 dump badging/resources распознаёт все иконки; регрессии обновления и запуска проходят. Физический Android недоступен, отображение в его лаунчере не проверялось. Панель остаётся 0.54, редактор — 0.68.

Промпт генерации: single finished Android launcher icon for a personal piano-roll music composition app called Notka; square flat front view, full-bleed dark forest charcoal #101614; bold light lime-green #baef8a music-note symbol combined with a tiny piano keyboard, 3–4 broad keys and two dark key cutouts; crisp rounded geometry and subtle highlight, central safe area, no frame, text, watermark or mockup.
