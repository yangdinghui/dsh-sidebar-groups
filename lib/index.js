/**
 * dsh-sidebar-groups —— 宿主半侧。
 *
 * 这个插件没有任何宿主行为：它只是一个挂载点，让 profile 里存在这一行，
 * 从而让 package.json 的 `dsh.client` 声明被 dsh-client-modules 扫描到，
 * 把 `./client` 作为浏览器 bundle 提供给 Web GUI。
 *
 * 真正的折叠/拖动逻辑全部在 lib/client.js。
 *
 * @module dsh-sidebar-groups
 */

/** Cordis 插件名，必须与包名一致（loader 按它定位行）。 */
export const name = 'dsh-sidebar-groups'

/** 宿主侧不依赖任何服务。 */
export const inject = []

/** 空实现：宿主侧无事可做。 */
export function apply() {}
