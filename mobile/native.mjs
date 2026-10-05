/**
 * Everything the two apps change in the native projects Capacitor generates,
 * in one place, so `npx cap add` can be re-run and this re-applied:
 *
 *   node native.mjs            (from mobile/, after `npm install`)
 *
 * Idempotent: running it twice changes nothing the second time.
 *
 *  Android  icons and splash; microphone (calls), camera and photos (chat
 *           pictures) and notification permissions; versionCode/versionName
 *           from Gradle properties; release signing from environment
 *           variables (never a key in the repository).
 *  iPhone   icon and splash; what the microphone, camera and photos are for;
 *           the push entitlement and Background Modes → remote notification;
 *           the two AppDelegate callbacks Capacitor's push plugin needs;
 *           "uses no non-exempt encryption" (HTTPS only), so every upload is
 *           not stopped by the export-compliance question.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* Any ffmpeg: FFMPEG=/path/to/ffmpeg, or one on the PATH. */
const FF = process.env.FFMPEG || 'ffmpeg';
const ff = (args) => execFileSync(FF, ['-y', '-loglevel', 'error', ...args]);
const edit = (file, fn) => { const a = fs.readFileSync(file, 'utf8'); const b = fn(a); if (a !== b) fs.writeFileSync(file, b); };
/* An image of exactly w×h, the picture scaled to cover it and centred; no alpha when asked (App Store icons must not have one). */
const fit = (src, out, w, h, opaque = false) => ff(['-i', src, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}${opaque ? ',format=rgb24' : ''}`, '-frames:v', '1', out]);

for (const app of ['customer', 'support']) {
  const A = path.join(app, 'android/app');
  const I = path.join(app, 'ios/App');
  const art = path.join('assets', app);

  /* ── Android ── */
  edit(path.join(A, 'src/main/AndroidManifest.xml'), s => {
    const want = ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE'];
    for (const p of want) {
      if (!s.includes(`android.permission.${p}"`)) s = s.replace('<uses-permission android:name="android.permission.INTERNET" />', `<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.${p}" />`);
    }
    /* The camera is used if there is one; a tablet without one can still install. */
    if (!s.includes('android.hardware.camera')) s = s.replace('</manifest>', '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
    return s;
  });
  edit(path.join(A, 'build.gradle'), s => s
    .replace(/versionCode \d+\n/, "versionCode((project.findProperty('versionCode') ?: '1') as Integer)\n")
    .replace(/versionName "[^"]*"\n/, "versionName((project.findProperty('versionName') ?: '1.0') as String)\n")
    .replace(/    buildTypes \{\n        release \{\n            minifyEnabled false/, `    /* Release signing from the environment (mobile/README.md): the upload key
       never lives in the repository. Unset, a release build is unsigned. */
    signingConfigs {
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) signingConfig signingConfigs.release
            minifyEnabled false`));
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = path.join(A, `src/main/res/mipmap-${d}`);
    fit(path.join(art, 'icon-1024.png'), path.join(dir, 'ic_launcher.png'), 48 * k, 48 * k);
    fit(path.join(art, 'icon-1024.png'), path.join(dir, 'ic_launcher_round.png'), 48 * k, 48 * k);
    fit(path.join(art, 'icon-foreground-1024.png'), path.join(dir, 'ic_launcher_foreground.png'), 108 * k, 108 * k);
  }
  edit(path.join(A, 'src/main/res/values/ic_launcher_background.xml'), s => s.replace(/<color name="ic_launcher_background">#[0-9A-Fa-f]+<\/color>/, '<color name="ic_launcher_background">#0D1336</color>'));
  for (const dir of fs.readdirSync(path.join(A, 'src/main/res')).filter(d => d.startsWith('drawable'))) {
    const f = path.join(A, 'src/main/res', dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    /* Keep each density's own size. */
    const b = fs.readFileSync(f); const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    fit(path.join(art, 'splash-2732.png'), f + '.tmp.png', w, h);
    fs.renameSync(f + '.tmp.png', f);
  }

  /* ── iPhone ── */
  fit(path.join(art, 'icon-1024.png'), path.join(I, 'App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 1024, true);
  for (const f of fs.readdirSync(path.join(I, 'App/Assets.xcassets/Splash.imageset')).filter(f => f.endsWith('.png'))) {
    fit(path.join(art, 'splash-2732.png'), path.join(I, 'App/Assets.xcassets/Splash.imageset', f), 2732, 2732);
  }
  edit(path.join(I, 'App/Info.plist'), s => {
    const add = (key, xml) => (s.includes(`<key>${key}</key>`) ? s : s.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`));
    s = add('NSMicrophoneUsageDescription', '<string>Your microphone is used when you answer or make a call with a customer.</string>');
    s = add('NSCameraUsageDescription', '<string>Your camera is used when you take a picture to send in a chat.</string>');
    s = add('NSPhotoLibraryUsageDescription', '<string>Your photos are used when you choose a picture to send in a chat.</string>');
    s = add('UIBackgroundModes', '<array>\n\t\t<string>remote-notification</string>\n\t</array>');
    s = add('ITSAppUsesNonExemptEncryption', '<false/>');
    return s;
  });
  const ent = path.join(I, 'App/App.entitlements');
  if (!fs.existsSync(ent)) fs.writeFileSync(ent, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>production</string>
</dict>
</plist>
`);
  edit(path.join(I, 'App.xcodeproj/project.pbxproj'), s => (s.includes('CODE_SIGN_ENTITLEMENTS')
    ? s : s.replace(/(\t+)INFOPLIST_FILE = App\/Info\.plist;/g, '$1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n$1INFOPLIST_FILE = App/Info.plist;')));
  edit(path.join(I, 'App/AppDelegate.swift'), s => (s.includes('capacitorDidRegisterForRemoteNotifications') ? s : s.replace(/\n}\s*$/, `

    /* Capacitor's push plugin hears the phone's APNs token, or the reason
       there is none, through these two (worker/src/lib/push.ts sends to it). */
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
`)));
  /* iPhones always have push (APNs is the phone's own); the UA says so (services/nativeApp.ts). */
  for (const f of [path.join(app, 'capacitor.config.json'), path.join(I, 'App/capacitor.config.json')]) {
    if (!fs.existsSync(f)) continue;
    edit(f, s => s.replace(/(\((?:customer|support); ios)\)/, '$1; push)'));
  }
  console.log('applied', app);
}
