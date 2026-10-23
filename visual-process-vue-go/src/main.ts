import { mountPlugin } from "@mincode/plugin-ui/mount.js";
import "element-plus/theme-chalk/el-card.css";
import "element-plus/theme-chalk/el-descriptions.css";
import "element-plus/theme-chalk/el-descriptions-item.css";
import App from "./App.vue";
import "./styles.css";

mountPlugin(App, undefined, { pageScrollbar: false });
