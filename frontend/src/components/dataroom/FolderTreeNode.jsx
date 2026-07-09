import { useState, useRef, useEffect } from 'react';
import styles from './FolderTreeNode.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconFolder = () => (
  <svg className={styles.folderIcon} width="16" height="16" viewBox="0 0 24 24"
    fill="currentColor" stroke="none" aria-hidden="true">
    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconFolderTree = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
  </svg>
);

/* ── Inline form for add / edit ──────────────────────────── */

function InlineForm({ initialName, initialContext, onSubmit, onCancel, label }) {
  const [name, setName] = useState(initialName || '');
  const [context, setContext] = useState(initialContext || '');
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleSubmit() {
    const trimName = name.trim();
    const trimCtx = context.trim();
    if (!trimName) { setError('Folder name is required.'); return; }
    if (!trimCtx) { setError('Context description is required.'); return; }
    onSubmit({ name: trimName, context: trimCtx });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className={styles.inlineForm}>
      <span className={styles.inlineLabel}>{label}</span>
      <input
        ref={nameRef}
        className={styles.inlineInput}
        type="text"
        placeholder="Folder name"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        onKeyDown={handleKeyDown}
        maxLength={40}
      />
      <textarea
        className={styles.inlineTextarea}
        placeholder="Describe what files belong in this folder..."
        value={context}
        onChange={(e) => { setContext(e.target.value); setError(''); }}
        onKeyDown={handleKeyDown}
        rows={2}
      />
      {error && <p className={styles.inlineError}>{error}</p>}
      <div className={styles.inlineActions}>
        <button className={styles.inlineCancel} onClick={onCancel} title="Cancel" type="button">
          <IconX />
        </button>
        <button
          className={styles.inlineConfirm}
          onClick={handleSubmit}
          disabled={!name.trim() || !context.trim()}
          title="Confirm"
          type="button"
        >
          <IconCheck />
        </button>
      </div>
    </div>
  );
}

/* ── FolderTreeNode (recursive) ──────────────────────────── */

function FolderTreeNode({ node, depth, onAdd, onEdit, onDelete, readOnly }) {
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleAdd(data) {
    onAdd(node.id, data);
    setIsAdding(false);
  }

  function handleEdit(data) {
    onEdit(node.id, data);
    setIsEditing(false);
  }

  function handleDelete() {
    onDelete(node.id);
    setShowDeleteConfirm(false);
  }

  if (isEditing && !readOnly) {
    return (
      <div className={styles.node}>
        <InlineForm
          initialName={node.name}
          initialContext={node.context}
          onSubmit={handleEdit}
          onCancel={() => setIsEditing(false)}
          label="Edit folder"
        />
        {node.children.length > 0 && (
          <div className={styles.children}>
            {node.children.map((child) => (
              <FolderTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                onAdd={onAdd}
                onEdit={onEdit}
                onDelete={onDelete}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.node} ${readOnly ? styles.readOnly : ''}`}>
      <div className={styles.nodeRow}>
        <IconFolder />
        <div className={styles.nodeInfo}>
          <span className={styles.nodeName}>{node.name}</span>
          <span className={styles.nodeContext}>{node.context}</span>
        </div>
        {!readOnly && (
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={() => setIsAdding(true)}
              title="Add subfolder"
              type="button"
            >
              <IconPlus />
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => setIsEditing(true)}
              title="Edit"
              type="button"
            >
              <IconPencil />
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete"
              type="button"
            >
              <IconTrash />
            </button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className={styles.deleteConfirm}>
          <span>Delete &quot;{node.name}&quot;{node.children.length > 0 ? ' and all subfolders' : ''}?</span>
          <button className={styles.deleteNo} onClick={() => setShowDeleteConfirm(false)} type="button">No</button>
          <button className={styles.deleteYes} onClick={handleDelete} type="button">Yes</button>
        </div>
      )}

      {/* Children */}
      {node.children.length > 0 && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Inline add child form */}
      {isAdding && !readOnly && (
        <div className={styles.children}>
          <InlineForm
            onSubmit={handleAdd}
            onCancel={() => setIsAdding(false)}
            label="New subfolder"
          />
        </div>
      )}
    </div>
  );
}

/* ── Exported tree utilities ─────────────────────────────── */

export function addToTree(tree, parentId, newNode) {
  if (parentId === null) return [...tree, newNode];
  return tree.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, newNode] };
    }
    return { ...node, children: addToTree(node.children, parentId, newNode) };
  });
}

export function editInTree(tree, nodeId, updates) {
  return tree.map((node) => {
    if (node.id === nodeId) {
      return { ...node, ...updates };
    }
    return { ...node, children: editInTree(node.children, nodeId, updates) };
  });
}

export function deleteFromTree(tree, nodeId) {
  return tree
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: deleteFromTree(node.children, nodeId),
    }));
}

export function countFolders(tree) {
  return tree.reduce((sum, node) => sum + 1 + countFolders(node.children), 0);
}

export { FolderTreeNode, InlineForm, IconFolder, IconFolderTree, IconPlus };
export default FolderTreeNode;
