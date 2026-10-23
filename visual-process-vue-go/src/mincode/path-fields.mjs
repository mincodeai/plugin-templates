export function pathFieldKind(field) {
  if (field.id === 'root') return 'directory';
  return field.pathKind === 'file' || field.pathKind === 'directory' ? field.pathKind : undefined;
}
export function relativeProjectPath(root, selected) {
  const normalize = value => String(value).trim().replaceAll('\\', '/').replace(/\/+$/, '');
  const base = normalize(root), file = normalize(selected);
  const windows = /^[A-Za-z]:\//.test(base);
  const prefix = `${base}/`;
  if (!(windows ? file.toLowerCase().startsWith(prefix.toLowerCase()) : file.startsWith(prefix))
    || file.slice(prefix.length).split('/').some(part => part === '..' || part === '.')) {
    throw new Error('请选择项目目录内的文件；目录外的文件不能作为项目相对路径');
  }
  const relative = file.slice(prefix.length);
  if (!relative) throw new Error('请选择文件');
  return relative;
}
