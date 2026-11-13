// Optional transport for Windows-only VPNs. Defaults remain the official HTTPS repositories.
settingsEvaluated {
    pluginManagement.repositories.apply {
        clear()
        for (name in listOf("google", "central", "plugins")) maven {
            url = uri("http://127.0.0.1:18763/$name")
            isAllowInsecureProtocol = true
        }
    }
    dependencyResolutionManagement.repositories.apply {
        clear()
        for (name in listOf("google", "central")) maven {
            url = uri("http://127.0.0.1:18763/$name")
            isAllowInsecureProtocol = true
        }
    }
}
