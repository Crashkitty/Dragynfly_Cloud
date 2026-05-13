// Top-level build file. Per-module configuration lives in the module's own
// build.gradle.kts.
plugins {
    // Android plugin is declared in the module so the root file can stay
    // empty for now. Pin versions in your host app or in a future
    // libs.versions.toml.
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
