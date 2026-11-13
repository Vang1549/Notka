import java.util.Properties

plugins {
    id("com.android.application")
    kotlin("android")
}

val release =
    Properties().apply { rootProject.file("version.properties").inputStream().use(::load) }

android {
    namespace = "studio.notka.next"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    ndkVersion = "27.2.12479018"
    defaultConfig {
        applicationId = "studio.notka.next"
        minSdk = 21
        targetSdk = 35
        versionCode = release.getProperty("code").toInt()
        versionName = release.getProperty("name")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
        externalNativeBuild {
            cmake {
                cppFlags += "-std=c++17"
                arguments += "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
                arguments += "-DANDROID_STL=c++_shared"
            }
        }
    }
    signingConfigs {
        create("publication") {
            System.getenv("NOTKA_NEXT_KEYSTORE")?.let { storeFile = file(it) }
            storePassword = System.getenv("NOTKA_NEXT_KEY_PASSWORD")
            keyAlias = "notka-next"
            keyPassword = System.getenv("NOTKA_NEXT_KEY_PASSWORD")
            storeType = "PKCS12"
        }
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("publication")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        prefab = true
        buildConfig = true
    }
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
            System.getenv("NOTKA_BUILD_ROOT")?.let { buildStagingDirectory = file("$it/cxx") }
        }
    }
    packaging { jniLibs { useLegacyPackaging = false } }
}

dependencies {
    implementation(project(":core"))
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("com.google.oboe:oboe:1.9.3")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
