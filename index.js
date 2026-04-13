// index.js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from '../../CalcApp/app.json';

AppRegistry.registerComponent(appName, () => App);
