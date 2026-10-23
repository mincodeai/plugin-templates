// Bundled into each plugin; never import the host application's locale registry.
export const messages = {
  zh: {
    subtitle: '本地工具工作台 · 参数与结果仅在本页保留', connected: '已连接宿主', waiting: '等待宿主连接',
    requirements: '运行要求、安全边界与功能限制', parameters: '任务参数', configure: '配置输入后选择操作',
    guidance: '配置参数后执行操作，结果只保留在当前页面。',
    selectRoot: '请先选择项目目录', pickFailed: '选择路径失败', failed: '操作失败',
    directory: '选择目录', file: '选择文件', formatJSON: '格式化 JSON', invalidJSON: '请输入有效的 JSON', jsonObject: '请输入 JSON 对象', requiredRoot: '请填写项目绝对路径',
    safety: '执行前仍由宿主检查权限。远端操作不自动重试。关闭页面不保证取消后台任务。',
    results: '执行结果', seconds: '秒', clear: '清空结果', running: '任务执行中，请等待宿主返回；请勿重复操作',
    incomplete: '操作未完成，请检查提示并调整参数', empty: '尚无执行结果',
    readyHint: '填写任务参数并选择操作，结果将在这里展示', waitingHint: '正在建立宿主连接，连接完成后即可执行操作',
    overview: '分析视图', filterPlaceholder: '筛选当前结果（不重新执行任务）', filter: '筛选结果', limitations: '限制与未覆盖', noNotes: '没有附加说明', raw: '原始结果',
  },
  en: {
    subtitle: 'Local workbench · Parameters and results stay on this page', connected: 'Host connected', waiting: 'Waiting for host',
    requirements: 'Requirements, safety boundaries and limitations', parameters: 'Task parameters', configure: 'Configure inputs, then choose an action',
    guidance: 'Configure parameters and run an action. Results are retained only on this page.',
    selectRoot: 'Select a project directory first', pickFailed: 'Failed to select a path', failed: 'Operation failed',
    directory: 'Select directory', file: 'Select file', formatJSON: 'Format JSON', invalidJSON: 'Enter valid JSON', jsonObject: 'Enter a JSON object', requiredRoot: 'Enter an absolute project path',
    safety: 'The host checks permissions before execution. Remote operations are not retried automatically. Closing this page does not guarantee background tasks are cancelled.',
    results: 'Results', seconds: 's', clear: 'Clear results', running: 'Task running; wait for the host response. Do not repeat the operation.',
    incomplete: 'Operation incomplete. Review the message and adjust parameters.', empty: 'No results yet',
    readyHint: 'Configure task parameters and choose an action to see results here.', waitingHint: 'Connecting to the host. Actions become available once connected.',
    overview: 'Analysis', filterPlaceholder: 'Filter current results (does not rerun the task)', filter: 'Filter results', limitations: 'Limitations and uncovered cases', noNotes: 'No additional notes', raw: 'Raw result',
  },
};
export function normalizeLocale(locale) {
  return typeof locale === 'string' && /^zh(?:[-_]|$)/i.test(locale) ? 'zh' : 'en';
}
export function pluginMessages(locale) { return messages[normalizeLocale(locale)]; }
export const pluginLocaleKey = Symbol('plugin-locale');
