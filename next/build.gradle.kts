plugins {
    id("com.android.application") version "8.7.3" apply false
    kotlin("android") version "2.1.20" apply false
    kotlin("jvm") version "2.1.20" apply false
    kotlin("plugin.serialization") version "2.1.20" apply false
}

allprojects {
    System.getenv("NOTKA_BUILD_ROOT")?.let {
        layout.buildDirectory.set(file("$it/${project.name}"))
    }
}
