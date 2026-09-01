# Fulbito para Android

Este módulo construye una aplicación Android nativa mínima que abre la versión
publicada de Fulbito en un WebView endurecido. No incorpora claves, usuarios ni
datos de Supabase. Requiere conexión a Internet para consultar y registrar
información del club.

El proyecto incluye Gradle Wrapper 8.7, por lo que no requiere instalar Gradle
manualmente. Para compilar se necesita una única vez:

- JDK 17 configurado mediante `JAVA_HOME`.
- Android SDK Platform 34 y Build-Tools, instalables desde Android Studio.

Con esos requisitos, el APK de distribución se genera con:

```text
gradlew.bat :app:assembleDebug
```

El resultado queda en:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## APK final actualizable

La APK final se firma con una clave privada estable. Conservar la misma clave
es imprescindible: Android sólo permite instalar una actualización si la APK
nueva fue firmada con la misma identidad que la anterior.

El workflow manual **Android release** genera la APK firmada y la publica como
release de GitHub. Antes de ejecutarlo, se cargan una sola vez estos secretos
en `Settings > Secrets and variables > Actions` del repositorio:

- `ANDROID_KEYSTORE_BASE64`: el contenido Base64 del archivo `.jks` privado.
- `ANDROID_KEYSTORE_PASSWORD`: contraseña del archivo de clave.
- `ANDROID_KEY_ALIAS`: alias de la clave, por ejemplo `el-fulbito`.
- `ANDROID_KEY_PASSWORD`: contraseña de la clave.

No se sube el archivo `.jks` ni sus contraseñas al repositorio. El archivo
`keystore.properties.template` sirve sólo como referencia para una compilación
local firmada.
