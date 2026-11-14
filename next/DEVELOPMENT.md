# Разработка и выпуск Нотки 2

## На этом ПК

Исходники — `next/` основного репозитория. Инструменты, кеши, ключи, Android SDK и результаты Gradle — `D:\Tools\Notka\next`. Существующие JDK 21 и Python с cryptography/NumPy/SciPy используются из `D:\Tools\Notka`. Общие Java, Python и Android SDK не заменяются.

Из PowerShell в корне репозитория:

```powershell
# При текущем VPN WindowsNetwork передаёт загрузки Maven через Windows.
.\next\tools\build.ps1 -Mode Debug -WindowsNetwork
.\next\tools\build.ps1 -Mode Test -WindowsNetwork
.\next\tools\build.ps1 -Mode Lint -WindowsNetwork
.\next\tools\build.ps1 -Mode Release -WindowsNetwork
```

APK: `D:\Tools\Notka\next\build\app\outputs\apk\release\app-release.apk`. Debug имеет package `.debug` и устанавливается отдельно. `build.ps1` не публикует файлы, не заменяет ключ и не копирует новую сборку поверх выпущенного APK.

`-WindowsNetwork` необязателен при рабочей сети WSL. Он запускает локальный Maven transport: Linux-сервер слушает только `127.0.0.1:18763`, Windows-worker скачивает только с официальных Google/Maven/Gradle plugin repositories. Очередь и кеш лежат в папке Notka. Это вспомогательные процессы разработки, не службы Windows и не автозагрузка. Обычный Gradle без init-script использует официальные HTTPS-репозитории.

## На другой машине

Установить JDK 21, Android SDK Platform 35, build-tools 35.0.0, NDK 27.2.12479018 и CMake 3.22.1. `toolchain-downloads.json` фиксирует использованные Linux-архивы и хеши; `tools/install-archives.py` устанавливает заранее загруженные архивы в отдельную папку. Лицензии SDK прочитать и принять через sdkmanager. На Windows проект также можно открыть в Android Studio с этими компонентами.

Gradle Wrapper 8.9 включён в репозиторий; архив проверяется SHA-256. При обычной сборке `ANDROID_HOME` указывает на SDK, `JAVA_HOME` — на JDK, `GRADLE_USER_HOME` — на выбранный кеш. Не добавлять local.properties и ключи в Git.

```sh
cd next
./gradlew -PcoreOnly=true :core:test
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:lintDebug
./gradlew :app:connectedDebugAndroidTest
```

Необязательная проверка настоящих загрузок GitHub: `adb shell am instrument -w -e network true studio.notka.next.debug.test/androidx.test.runner.AndroidJUnitRunner`. Без флага сетевой сценарий пропускается; остальные работают офлайн.

Для выпуска задать `NOTKA_NEXT_KEYSTORE` и `NOTKA_NEXT_KEY_PASSWORD`. Единственный существующий ключ — `D:\Tools\Notka\next\keys\notka-next.p12`, alias `notka-next`, пароль в соседнем password.txt. Не генерировать другой ключ при потере доступа: существующие установки перестанут принимать обновления. Ключ и пароль резервировать отдельно от публичного репозитория.

## Что проверять

- Изменения модели/импорта/истории/MIDI: `:core:test`.
- Изменения сэмплера: `app/src/test/cpp/dsp_test.cpp` вместе с `sampler.cpp`, обычный C++17-компилятор. Тест не зависит от Android/Oboe. Затем Android-интеграция и сравнение реального WAV.
- UI, звук, банки и экспорт: `:app:connectedDebugAndroidTest` на выделенном устройстве. Тест создаёт тестовые проекты и файлы в данных debug-приложения; не запускать в личной рабочей копии.
- API-совместимость: `:app:lintDebug`. Предупреждение об устаревшем API не равно отсутствию поддержки старого Android; ошибки NewApi должны разбираться.
- Телефон: одновременная установка со старой Ноткой, импорт личного .notka, динамик/наушники/Bluetooth, жесты, ориентация, фоновой экспорт и установка следующего обновления. Эмулятор не подтверждает задержку реального аудиоустройства.

Автоматические проверки запускаются по изменению. Публикатор не вводит обязательный полный тестовый барьер. Он проверяет подписи, целостность и неизменяемость файлов.

Host DSP также запускается стандартным CMake без Android:

```sh
cmake -S app/src/main/cpp -B /path/to/notka-dsp-build
cmake --build /path/to/notka-dsp-build --config Release
ctest --test-dir /path/to/notka-dsp-build -C Release --output-on-failure
```

Android-тест оставляет результаты в приватном `files/verification/` debug-приложения. Их можно забрать через `adb exec-out run-as studio.notka.next.debug tar cf - files/verification` (вывод сохранять как бинарные байты, не через текстовое перенаправление старого PowerShell). После распаковки `python tools/check-media.py /path/to/files/verification` проверяет высоты C/E/G, амплитуду и декодирование всех форматов, сохраняет analysis.json и video-frame.png. Требуются NumPy и imageio-ffmpeg; на этом ПК они уже находятся в отдельной среде Notka. Если устройство не поддерживает один из кодировщиков, проверять только реально созданные форматы и явно отметить пропуск.

## Выпуск

1. Увеличить `code` и `name` в version.properties. Для новых байтов нужен новый code, даже при небольшом исправлении.
2. Собрать Release и проверить именно полученный APK. Записать результаты и ограничения в release-notes.md; обновить PARITY.md.
3. В WSL из корня проекта выполнить `bash next/tools/stage.sh next/release-notes.md`. Команда проверяет apksigner, выравнивание 16 КиБ, package/version и собственную подпись; сохраняет `next/dist/Notka2-<code>.apk`, подписывает channel.json и создаёт next/publication.json. Существующий APK другим содержимым не заменяет.
4. Проверить `python next/tools/release.py --verify-only` в окружении с cryptography. Закоммитить исходники, APK, канал и publication.json; отправить main. Workflow `Publish Notka 2` публикует выпуск. Ручной эквивалент — `python next/tools/release.py --publish` с GH_TOKEN либо уже настроенным Git Credential Manager.
5. Публикатор сначала создаёт/проверяет immutable asset, проверяет опубликованное скачивание и лишь затем передвигает native-updates на проверенный commit. Повторный запуск безопасен при совпадающих байтах. При ошибке канал остаётся на предыдущем выпуске.

Подписи создаются только локально. CI не получает приватный ключ. В GitHub нельзя добавлять password.txt, PKCS12/PEM, личные треки и оригинальный Floe-пакет. Публичные DER-сертификаты необходимы для проверки и включаются в Git.

## Форматирование и границы изменений

Kotlin/.kts отформатированы ktfmt 0.54 с Kotlinlang style; C++ — clang-format с `next/.clang-format`. Менять модули по их ответственности, а не собирать всё в один файл. Общее описание связей — ARCHITECTURE.md. Не переносить инструменты или промежуточные сборки в репозиторий.

## Проверка переноса 0.80

Эталон — `dist/bundles/80.zip`, копия в `app/src/androidTest/assets/editor-80.zip` должна иметь тот же SHA-256. Её не изменять ради прохождения теста. `ReferenceParityTest` создаёт одинаковый трёхдорожечный проект, проверяет диапазон клавиш и сохраняет шесть пар кадров с базовыми/расширенными эффектами в `files/verification/parity` тестового приложения. `NativeIntegrationTest` проверяет вход через стартовую панель, длину новой ноты, жест переноса, копирование, сохранения, звук и экспорт. Host DSP дополнительно проверяет молчание предзапуска и точное совпадение последующего звука.

После UI-изменений сверять реальные окна с APK 0.68 на одинаковом разрешении; тест renderer не подтверждает совпадение всех диалогов. Тестовая копия старого WebView допустима только в androidTest. В production его не добавлять.
