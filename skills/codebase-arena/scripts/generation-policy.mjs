export const readOnlyTaskTypeTargets = Object.freeze({
  retrieve_explain: 6,
  impact_analyze: 5,
  diagnose: 4
});

export const readOnlyGenerationLoadTargets = Object.freeze({
  none: 15,
  low: 0,
  medium: 0
});

export const readOnlyAuthoringPolicy = Object.freeze({
  mode: 'read-only-code-understanding',
  sourceMutation: 'forbidden',
  projectExecution: 'forbidden',
  requiredCitationForm: 'repository-root-relative-path-symbol-line-range',
  resultSurface: 'final-response-and-static-frozen-source'
});

const readOnlyTaskTypes = new Set(Object.keys(readOnlyTaskTypeTargets));
const forbiddenActionEn = /\b(?:implement|modify|edit|patch|refactor|write code|change source|add tests?|run tests?|execute tests?|start (?:the )?(?:app|service|server)|build (?:the )?(?:app|project|repository))\b/i;
const forbiddenActionZh = /(?:实现|修改|编辑|改动源码|提交补丁|重构|编写代码|新增测试|运行测试|执行测试|启动(?:应用|服务|服务器)|构建(?:应用|项目|代码库))/;

function localizedText(value) {
  return `${value?.['zh-CN'] || ''}\n${value?.en || ''}`;
}

function localizedLists(value) {
  return `${(value?.['zh-CN'] || []).join('\n')}\n${(value?.en || []).join('\n')}`;
}

export function validateReadOnlyBlueprintPolicy(blueprint) {
  const errors = [];
  if (blueprint?.schemaVersion !== 4) errors.push('schemaVersion must be 4');
  for (const [key, expected] of Object.entries(readOnlyTaskTypeTargets)) if (blueprint?.taskTypeTargets?.[key] !== expected) errors.push(`taskTypeTargets.${key} must equal ${expected}`);
  const taskKeys = Object.keys(blueprint?.taskTypeTargets || {}).sort();
  if (JSON.stringify(taskKeys) !== JSON.stringify(Object.keys(readOnlyTaskTypeTargets).sort())) errors.push('taskTypeTargets must contain only retrieve_explain, impact_analyze, and diagnose');
  for (const [key, expected] of Object.entries(readOnlyGenerationLoadTargets)) if (blueprint?.generationLoadTargets?.[key] !== expected) errors.push(`generationLoadTargets.${key} must equal ${expected}`);
  const authoringPolicy = blueprint?.authoringPolicy || {};
  for (const [key, expected] of Object.entries(readOnlyAuthoringPolicy)) if (authoringPolicy[key] !== expected) errors.push(`authoringPolicy.${key} must equal ${expected}`);
  if (Object.keys(authoringPolicy).some((key) => !Object.hasOwn(readOnlyAuthoringPolicy, key))) errors.push('authoringPolicy contains unsupported fields');
  if (blueprint?.generationLoadPolicy?.allowed?.length !== 1 || blueprint.generationLoadPolicy.allowed[0] !== 'none') errors.push('generationLoadPolicy.allowed must contain only none');
  if (blueprint?.automaticEvaluationTarget !== 15) errors.push('automaticEvaluationTarget must equal 15');
  for (const concept of blueprint?.caseConcepts || []) if (concept?.generationLoad !== 'none') errors.push(`${concept?.id || 'case concept'} generationLoad must be none`);
  return errors;
}

export function validateReadOnlyPublicCase(publicCase) {
  const errors = [];
  if (!readOnlyTaskTypes.has(publicCase?.taskType)) errors.push(`taskType ${publicCase?.taskType} is not allowed`);
  const requestedActions = `${localizedLists(publicCase?.allowedOperations)}\n${localizedLists(publicCase?.deliverables)}`;
  if (forbiddenActionEn.test(requestedActions) || forbiddenActionZh.test(requestedActions)) errors.push('allowed operations or deliverables require development or project execution');
  const forbiddenOperations = localizedLists(publicCase?.forbiddenOperations);
  for (const required of [
    { en: /\bmodify (?:the )?(?:source|repository)\b/i, zh: /(?:修改|改动)(?:源码|代码仓)/ },
    { en: /\brun (?:the )?(?:project )?tests?\b/i, zh: /运行(?:项目)?测试/ },
    { en: /\bbuild (?:the )?(?:project|repository)\b/i, zh: /构建(?:项目|代码仓)/ },
    { en: /\bstart (?:the )?(?:app|application|service|server)\b/i, zh: /启动(?:应用|服务|服务器)/ }
  ]) {
    if (!required.en.test(forbiddenOperations) || !required.zh.test(forbiddenOperations)) errors.push('forbiddenOperations must explicitly forbid source modification, project tests, builds, and service/application startup in both locales');
  }
  const zhEvidence = `${publicCase?.prompt?.['zh-CN'] || ''}\n${(publicCase?.deliverables?.['zh-CN'] || []).join('\n')}`;
  const enEvidence = `${publicCase?.prompt?.en || ''}\n${(publicCase?.deliverables?.en || []).join('\n')}`;
  if (!/仓库根相对路径/.test(zhEvidence) || !/符号/.test(zhEvidence) || !/(?:行号|行范围)/.test(zhEvidence)) errors.push('zh-CN prompt/deliverables must require repository-root-relative paths, symbols, and precise line numbers or ranges');
  if (!/repository-root-relative path/i.test(enEvidence) || !/\bsymbols?\b/i.test(enEvidence) || !/\bline (?:number|range)s?\b/i.test(enEvidence)) errors.push('en prompt/deliverables must require repository-root-relative paths, symbols, and precise line numbers or ranges');
  const environment = publicCase?.environment;
  if ((environment?.services || []).length || (environment?.requirementIds || []).length) errors.push('read-only cases cannot require services or runtime requirements');
  if (environment?.sideEffects?.mode !== 'snapshot-only') errors.push('read-only cases must use snapshot-only side effects');
  for (const field of ['resourceIds', 'outsideSnapshotWrites', 'cleanupControlIds']) if ((environment?.sideEffects?.[field] || []).length) errors.push(`read-only cases require empty sideEffects.${field}`);
  return errors;
}

export function validateReadOnlyPrivateCase(privateCase) {
  const errors = [];
  if (privateCase?.generationLoad !== 'none') errors.push('generationLoad must be none');
  if (privateCase?.difficulty?.validation !== 'V1') errors.push('difficulty.validation must be V1 static review');
  if ((privateCase?.estimatedCost?.services || []).length) errors.push('estimatedCost.services must be empty');
  const verification = privateCase?.verification || {};
  if (verification.type !== 'human-review') errors.push('verification.type must be human-review for read-only cases');
  if ((verification.command || []).length || (verification.injectFiles || []).length) errors.push('read-only result checking cannot execute commands or inject files');
  if ((verification.setupCommands || []).length || (verification.cleanupCommands || []).length) errors.push('result checking cannot run setup or cleanup commands against the candidate project');
  const commandText = (verification.command || []).join(' ');
  if (/(?:--test|\bjest\b|\bvitest\b|\bpytest\b|\bgo test\b|\bcargo test\b|\bbuild\b|\bstart\b|\bserve\b)/i.test(commandText)) errors.push('result checking command must inspect response/static source rather than run project tests, builds, or services');
  const lineEvidence = (privateCase?.evidence || []).filter((item) => typeof item?.source === 'string' && /:\d+(?:-\d+)?(?:$|[:,\s])/.test(item.source));
  if (lineEvidence.length < 2) errors.push('at least two sealed evidence entries must cite precise repository line numbers or ranges');
  const maxima = Object.fromEntries((privateCase?.scoringCriteria?.criteria || []).map((item) => [item.id, item.max]));
  const expectedMaxima = { core: 4, localization: 2.5, reasoning: 2, impact: 1, verification: 0.5 };
  if (Object.keys(maxima).length !== Object.keys(expectedMaxima).length || Object.entries(expectedMaxima).some(([key, value]) => maxima[key] !== value)) errors.push('scoring criteria must weight core=4, localization=2.5, reasoning=2, impact=1, verification=0.5');
  return errors;
}

export function containsForbiddenReadOnlyAction(value) {
  const text = typeof value === 'string' ? value : localizedText(value);
  return forbiddenActionEn.test(text) || forbiddenActionZh.test(text);
}
