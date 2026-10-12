import type { HarnessApprovalPolicy, HarnessPermissionMode } from '../types/harness'
import type { AppIconName } from '../components/AppIcon.vue'

const permissionLabels: Record<HarnessPermissionMode, string> = {
  READ_ONLY: '只读',
  WORKSPACE_WRITE: '工作区写入',
  FULL_ACCESS: '完整访问',
}

export function permissionModeLabel(mode: HarnessPermissionMode): string {
  return permissionLabels[mode]
}

const approvalLabels: Record<HarnessApprovalPolicy, string> = {
  ON_REQUEST: '按需审批',
  NEVER: '全自动',
}

export function approvalPolicyLabel(policy: HarnessApprovalPolicy): string {
  return approvalLabels[policy]
}

const toolLabels: Record<string, string> = {
  activate_skill: '启用技能',
  apply_patch: '修改文件',
  shell_command: '运行命令',
  web__run: '检索资料',
  read_file: '读取文件',
  read_source: '读取源码',
  write_file: '写入文件',
  execute_process: '执行进程',
  plan_create: '创建计划',
  plan_step: '更新计划步骤',
  plan_verify: '验证计划',
  list_files: '浏览文件',
  search_source: '搜索源码',
}

export function toolNameLabel(name: string): string {
  return toolLabels[name] ?? name.replaceAll('_', ' ')
}

/** Operation icons stay stable across success/failure; status is shown separately. */
export function toolIconName(name: string): AppIconName {
  const normalized = name.toLowerCase()
  if (/verify|audit|validate|review/.test(normalized)) return 'inspect'
  if (/plan|todo/.test(normalized)) return 'list'
  if (/patch|edit|write|replace/.test(normalized)) return 'pencil'
  if (/search|grep|glob|find|web/.test(normalized)) return 'search'
  if (/list|directory|tree/.test(normalized)) return 'folder'
  if (/read|open|view/.test(normalized)) return 'document'
  if (/shell|command|exec|process|terminal|probe/.test(normalized)) return 'command'
  return 'settings'
}
