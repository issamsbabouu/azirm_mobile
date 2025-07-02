# === Règles ProGuard pour Azirm (React Native + Stripe + Jackson + Reanimated) ===

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Expo Modules / Keep React Native
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# Stripe Terminal & Stripe Core
-keep class com.stripe.terminal.** { *; }
-dontwarn com.stripe.terminal.**

# Retrofit (utilisé par Stripe ou d'autres SDK)
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**
-keepclassmembers class * {
    @retrofit2.http.* <methods>;
}

# Jackson - pour JSON parsing
-keep class com.fasterxml.jackson.databind.** { *; }
-keep class com.fasterxml.jackson.annotation.** { *; }
-keep class com.fasterxml.jackson.core.** { *; }
-dontwarn com.fasterxml.jackson.databind.**

# Java Beans - souvent requis par Jackson sur Android
-keep class java.beans.** { *; }
-dontwarn java.beans.**

# SLF4J logging support
-keep class org.slf4j.** { *; }
-dontwarn org.slf4j.**

# Éviter les suppressions d’annotations
-keepattributes *Annotation*

# Garder les constructeurs publics
-keepclassmembers class ** {
    public <init>(...);
}

