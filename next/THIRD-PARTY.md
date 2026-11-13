# Используемые компоненты

Код приложения использует Kotlin 2.1.20 и kotlinx.serialization 1.8.1 (JetBrains, Apache-2.0), Oboe 1.9.3 (Android Open Source Project, Apache-2.0) и Android NDK libc++ (LLVM, Apache-2.0 with LLVM exceptions и перечисленные в уведомлении прежние лицензии). Тексты уведомлений включены в `app/src/main/assets/licenses/`: Kotlin.txt, Oboe.txt, LLVM.txt.

Источники компонентов: https://github.com/JetBrains/kotlin, https://github.com/Kotlin/kotlinx.serialization, https://github.com/google/oboe, https://github.com/llvm/llvm-project. Версии зависимостей закреплены в Gradle; SDK/NDK — в toolchain-downloads.json. Тестовые библиотеки AndroidX не включены в release APK.

Встроенные звуки VSCO и MDA и скачиваемые GeneralUser имеют собственные уведомления VSCO.txt, MDA.txt, GeneralUser.txt. Скачиваемые подписанные банки сохраняют поля license/credits. `provenance.json` связывает перенесённые публичные данные с прежними исходниками.

FrozenPlain Music Box Suite Free не распространяется вместе с приложением или исходниками. Пользователь получает пакет у автора, импортирует локально, а его License.pdf сохраняется в приватных данных приложения. Публичный шаблон импорта содержит только описание соответствия файлов, без записей.

Это перечень сторонних компонентов, а не изменение лицензирования собственного кода владельца.
