pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "NotkaNext"

include(":core")

// JVM migration/editing tests can run without downloading the Android SDK or NDK.
if (providers.gradleProperty("coreOnly").orNull != "true") include(":app")
