import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lunirascreen.app",
  appName: "Lunira Screen",
  webDir: "../dist",
  server: {
    androidScheme: "https",
    cleartext: false
  },
  android: {
    backgroundColor: "#07080d"
  }
};

export default config;
