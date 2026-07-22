// Polyfills must install their globals before the application modules load.
import "./src/polyfills.ts";
import { registerRootComponent } from "expo";
import App from "./App.tsx";

registerRootComponent(App);
