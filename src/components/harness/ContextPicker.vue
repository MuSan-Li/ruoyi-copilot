<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppIcon from '../AppIcon.vue'
import { MAX_WORKSPACE_MANIFEST_PROJECTS } from '../../types/harness'
import type { WorkspaceManifest, WorkspaceManifestProject } from '../../types/harness'

interface Props {
  workspacePath: string
  projects: readonly WorkspaceManifestProject[]
  activeWorkspacePath?: string | null
  activeManifest?: WorkspaceManifest | null
  error?: string
  disabled?: boolean
}

interface Emits {
  update: [value: string]
  'update:projects': [value: readonly WorkspaceManifestProject[]]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const projectsExpanded = shallowRef(false)

function onProjectsToggle(event: Event): void {
  projectsExpanded.value = (event.target as HTMLDetailsElement).open
}

const displayedWorkspacePath = computed(() => props.activeWorkspacePath ?? props.workspacePath)
const projectCountLabel = computed(() => `${props.projects.length} / ${MAX_WORKSPACE_MANIFEST_PROJECTS}`)

function updateWorkspace(event: Event): void {
  emit('update', (event.target as HTMLInputElement).value)
}

function updateProject(
  index: number,
  field: 'projectId' | 'relativePath' | 'displayName',
  event: Event,
): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:projects', props.projects.map((project, projectIndex) => projectIndex === index
    ? { ...project, [field]: value }
    : project))
}

function updateTags(index: number, event: Event): void {
  const tags = (event.target as HTMLInputElement).value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
  emit('update:projects', props.projects.map((project, projectIndex) => projectIndex === index
    ? { ...project, tags }
    : project))
}

function addProject(): void {
  if (props.disabled || props.projects.length >= MAX_WORKSPACE_MANIFEST_PROJECTS) return
  emit('update:projects', [...props.projects, {
    projectId: '',
    relativePath: '',
    displayName: '',
    tags: [],
  }])
}

function removeProject(index: number): void {
  if (props.disabled) return
  emit('update:projects', props.projects.filter((_, projectIndex) => projectIndex !== index))
}
</script>

<template>
  <section class="context-picker" aria-label="工作区上下文">
    <label class="setting-field context-picker-root">
      <span><AppIcon name="folder" :size="14" /> {{ activeManifest ? '当前会话工作区' : '下一任务工作区' }}</span>
      <input
        :value="displayedWorkspacePath"
        type="text"
        placeholder="留空使用后端默认工作区"
        :disabled="disabled || Boolean(activeManifest)"
        @input="updateWorkspace"
      />
      <small>填写后端可访问的项目目录。创建会话后工作区固定。</small>
    </label>

    <details class="manifest-details" :open="projectsExpanded || Boolean(error)" @toggle="onProjectsToggle">
    <summary class="manifest-summary"><AppIcon name="branch" :size="15" /><span>项目清单</span><small>{{ activeManifest ? activeManifest.projects.length : projects.length }} 个项目</small><AppIcon name="chevron" :size="13" /></summary>
    <div class="manifest-heading">
      <div>
        <strong>跨项目工作区</strong>
        <span v-if="activeManifest">当前会话配置</span>
        <span v-else>可选 · {{ projectCountLabel }}</span>
      </div>
      <button
        v-if="!activeManifest"
        class="manifest-add-button"
        type="button"
        :disabled="disabled || projects.length >= MAX_WORKSPACE_MANIFEST_PROJECTS"
        @click="addProject"
      >
        <AppIcon name="plus" :size="13" /> 添加项目
      </button>
    </div>

    <p class="manifest-scope-note">
      添加工作区内的项目，让智能体同时理解后端、管理端和前端。
    </p>

    <div v-if="activeManifest" class="manifest-readonly-list" aria-label="当前会话项目">
      <article
        v-for="project in activeManifest.projects"
        :key="project.projectId"
        class="manifest-readonly-project"
      >
        <div>
          <strong>{{ project.displayName }}</strong>
          <span>{{ project.projectId }}</span>
        </div>
        <code>{{ project.relativePath }}</code>
        <div v-if="project.tags.length" class="manifest-tags">
          <span v-for="tag in project.tags" :key="tag">{{ tag }}</span>
        </div>
      </article>
    </div>

    <template v-else>
      <p v-if="projects.length === 0" class="manifest-empty">
        当前按单个工作区处理。跨项目任务可在这里添加项目。
      </p>
      <div v-else class="manifest-project-list">
        <article v-for="(project, index) in projects" :key="`manifest-project-${index}`" class="manifest-project-row">
          <div class="manifest-project-index">{{ index + 1 }}</div>
          <label>
            <span>项目 ID</span>
            <input
              :value="project.projectId"
              placeholder="backend"
              :disabled="disabled"
              maxlength="64"
              @input="updateProject(index, 'projectId', $event)"
            />
          </label>
          <label>
            <span>相对路径</span>
            <input
              :value="project.relativePath"
              placeholder="ruoyi-ai"
              :disabled="disabled"
              maxlength="512"
              @input="updateProject(index, 'relativePath', $event)"
            />
          </label>
          <label>
            <span>显示名称</span>
            <input
              :value="project.displayName"
              placeholder="Java 后端"
              :disabled="disabled"
              maxlength="128"
              @input="updateProject(index, 'displayName', $event)"
            />
          </label>
          <label>
            <span>标签</span>
            <input
              :value="project.tags.join(', ')"
              placeholder="java, backend"
              :disabled="disabled"
              @change="updateTags(index, $event)"
            />
          </label>
          <button
            class="manifest-remove-button"
            type="button"
            :disabled="disabled"
            :aria-label="`移除项目 ${index + 1}`"
            @click="removeProject(index)"
          >
            <AppIcon name="x" :size="13" />
          </button>
        </article>
      </div>
      <p v-if="error" class="manifest-error" role="alert">{{ error }}</p>
    </template>
    </details>
  </section>
</template>

<style scoped>
.context-picker { gap: 15px; }
.context-picker-root { gap: 8px; }
.context-picker-root > span { font-size: 12px; font-weight: 500; }
.context-picker-root input { padding: 10px 12px; font-size: 12px; border-color: var(--color-border-strong); border-radius: 8px; background: var(--color-surface-subtle); color: var(--color-text); }
.context-picker-root small { font-size: 10px; line-height: 1.6; color: var(--color-text-muted); }
.manifest-details { border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface); padding: 0 12px; }
.manifest-summary { display: flex; align-items: center; gap: 8px; padding: 12px 0; color: var(--color-text-secondary); cursor: pointer; list-style: none; font-size: 12px; }
.manifest-summary::-webkit-details-marker { display: none; }
.manifest-summary small { margin-left: auto; font-size: 10px; color: var(--color-text-muted); }
.manifest-summary > svg:last-child { transition: transform .15s; }
.manifest-details[open] .manifest-summary > svg:last-child { transform: rotate(90deg); }
.manifest-heading { padding-top: 10px; border-top: 1px solid var(--color-border); }
.manifest-scope-note { margin: 10px 0; }
.manifest-project-list, .manifest-readonly-list, .manifest-empty { margin-bottom: 12px; }
.manifest-project-row { background: var(--color-surface-subtle); }
</style>
