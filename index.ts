import { registerRootComponent } from 'expo';

import App from './App';
// Registers the driver's background location task; it has to exist before the app renders.
import './src/features/driver/backgroundLocation';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
