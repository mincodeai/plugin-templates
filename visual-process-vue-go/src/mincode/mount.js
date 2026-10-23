import { createApp, h } from 'vue';
import { ElScrollbar } from 'element-plus';
// Official builds swap this module for the stylesheets of the components the page uses.
import './element-plus-styles.js';
import './foundation.css';
import './page.css';
import './scrollbar.css';
export function mountPlugin(Page, config, options = {}) {
  const renderPage = () => h(Page, { config });
  createApp({
    render: options.pageScrollbar === false
      ? renderPage
      : () => h(ElScrollbar, { class: 'plugin-page-scrollbar' }, { default: renderPage }),
  }).mount('#app');
}
