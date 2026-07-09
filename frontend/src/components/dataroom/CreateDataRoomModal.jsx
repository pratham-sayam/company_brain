import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { createDataroom } from '../../store/dataroomSlice';
import { createFolder } from '../../store/folderSlice';
import FolderTreeNode, {
  addToTree,
  editInTree,
  deleteFromTree,
  countFolders,
  InlineForm,
  IconFolderTree,
} from './FolderTreeNode';
import treeStyles from './FolderTreeNode.module.css';
import styles from './CreateDataRoomModal.module.css';

/* ── Icons ───────────────────────────────────────────────── */

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconCheck = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ── Step labels ─────────────────────────────────────────── */

const STEP_LABELS = ['Basic Info', 'Folder Structure', 'Review & Create'];

/* ── Component ───────────────────────────────────────────── */

function CreateDataRoomModal({ onClose, onCreated }) {
  const dispatch = useDispatch();

  // Step navigation (0, 1, 2)
  const [step, setStep] = useState(0);

  // Step 1 state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 2 state — local tree, not Redux
  const [folders, setFolders] = useState([]);
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [treeError, setTreeError] = useState('');

  // Step 3 state
  const [isCreating, setIsCreating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const [createError, setCreateError] = useState('');

  // ── Tree manipulation callbacks ────────────────────────

  function handleAddFolder(parentId, data) {
    const newNode = {
      id: crypto.randomUUID(),
      name: data.name,
      context: data.context,
      children: [],
    };
    setFolders((prev) => addToTree(prev, parentId, newNode));
    setTreeError('');
  }

  function handleAddRoot(data) {
    const newNode = {
      id: crypto.randomUUID(),
      name: data.name,
      context: data.context,
      children: [],
    };
    setFolders((prev) => [...prev, newNode]);
    setIsAddingRoot(false);
    setTreeError('');
  }

  function handleEditFolder(nodeId, data) {
    setFolders((prev) => editInTree(prev, nodeId, data));
  }

  function handleDeleteFolder(nodeId) {
    setFolders((prev) => deleteFromTree(prev, nodeId));
  }

  // ── Step validation ────────────────────────────────────

  const canProceedStep0 = name.trim().length > 0;
  const totalFolders = countFolders(folders);
  const canProceedStep1 = totalFolders > 0;

  function goNext() {
    if (step === 0 && !canProceedStep0) return;
    if (step === 1) {
      if (!canProceedStep1) {
        setTreeError('Add at least one folder before proceeding.');
        return;
      }
      setTreeError('');
    }
    setStep((s) => Math.min(s + 1, 2));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  // ── Step 3: Create DataRoom + folders ──────────────────

  async function handleCreate() {
    setIsCreating(true);
    setCreateError('');

    try {
      // 1. Create the DataRoom
      const dr = await dispatch(
        createDataroom({ name: name.trim(), description: description.trim() || null })
      ).unwrap();

      const dataroomId = dr.id;

      // 2. Create folders breadth-first so parents exist before children
      const tempToReal = {};
      const queue = folders.map((f) => ({ ...f, realParentId: null }));

      while (queue.length > 0) {
        const node = queue.shift();
        const folder = await dispatch(
          createFolder({
            dataroomId,
            parentFolderId: node.realParentId,
            name: node.name,
            context: node.context,
          })
        ).unwrap();

        tempToReal[node.id] = folder.id;

        for (const child of node.children) {
          queue.push({ ...child, realParentId: folder.id });
        }
      }

      setCreatedId(dataroomId);
      setIsSuccess(true);
    } catch (err) {
      setCreateError(typeof err === 'string' ? err : err.message || 'Failed to create DataRoom.');
      setIsCreating(false);
    }
  }

  function handleDone() {
    if (onCreated && createdId) onCreated(createdId);
    onClose();
  }

  // ── Render helpers ─────────────────────────────────────

  function renderStepDots() {
    return (
      <div className={styles.steps}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              className={`${styles.stepDot} ${
                i === step ? styles.stepDotActive : i < step ? styles.stepDotDone : ''
              }`}
              title={label}
            />
            {i < STEP_LABELS.length - 1 && (
              <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderStep0() {
    return (
      <>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="dr-name">
            DataRoom Name
          </label>
          <input
            id="dr-name"
            className={styles.input}
            type="text"
            placeholder="e.g., Project Alpha Due Diligence"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="dr-desc">
            Description <span className={styles.labelHint}>(optional)</span>
          </label>
          <textarea
            id="dr-desc"
            className={styles.textarea}
            placeholder="Briefly describe the purpose of this DataRoom..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
      </>
    );
  }

  function renderStep1() {
    return (
      <>
        <div className={styles.treeHeader}>
          <span className={styles.treeTitle}>Build your folder structure</span>
          {totalFolders > 0 && (
            <span className={styles.folderCount}>{totalFolders} folder{totalFolders !== 1 ? 's' : ''}</span>
          )}
        </div>

        {folders.length === 0 && !isAddingRoot ? (
          <div className={treeStyles.emptyTree}>
            <IconFolderTree />
            <span>No folders yet. Add your first folder to get started.</span>
          </div>
        ) : (
          <div className={styles.treeContainer}>
            {folders.map((node) => (
              <FolderTreeNode
                key={node.id}
                node={node}
                depth={0}
                onAdd={handleAddFolder}
                onEdit={handleEditFolder}
                onDelete={handleDeleteFolder}
                readOnly={false}
              />
            ))}
          </div>
        )}

        {isAddingRoot ? (
          <InlineForm
            onSubmit={handleAddRoot}
            onCancel={() => setIsAddingRoot(false)}
            label="New root folder"
          />
        ) : (
          <button
            className={treeStyles.addRootBtn}
            onClick={() => setIsAddingRoot(true)}
            type="button"
          >
            + Add Root Folder
          </button>
        )}

        {treeError && <p className={styles.validationError}>{treeError}</p>}
      </>
    );
  }

  function renderStep2() {
    if (isSuccess) {
      return (
        <div className={styles.successOverlay}>
          <div className={styles.successIcon}>
            <IconCheck />
          </div>
          <span className={styles.successText}>DataRoom created!</span>
          <span className={styles.successHint}>
            &quot;{name.trim()}&quot; with {totalFolders} folder{totalFolders !== 1 ? 's' : ''} is ready.
          </span>
        </div>
      );
    }

    if (isCreating) {
      return (
        <div className={styles.creatingOverlay}>
          <div className={styles.spinner} />
          <span className={styles.creatingText}>Creating DataRoom and folders...</span>
        </div>
      );
    }

    return (
      <>
        <div className={styles.previewSection}>
          <p className={styles.previewLabel}>DataRoom Name</p>
          <p className={styles.previewValue}>{name.trim()}</p>
        </div>

        {description.trim() && (
          <div className={styles.previewSection}>
            <p className={styles.previewLabel}>Description</p>
            <p className={styles.previewDesc}>{description.trim()}</p>
          </div>
        )}

        <div className={styles.previewSection}>
          <p className={styles.previewLabel}>
            Folder Structure ({totalFolders} folder{totalFolders !== 1 ? 's' : ''})
          </p>
          <div className={styles.previewTree}>
            {folders.map((node) => (
              <FolderTreeNode
                key={node.id}
                node={node}
                depth={0}
                onAdd={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                readOnly
              />
            ))}
          </div>
        </div>

        {createError && <p className={styles.errorText}>{createError}</p>}
      </>
    );
  }

  // ── Main render ────────────────────────────────────────

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>
              {isSuccess ? 'Success' : `New DataRoom`}
            </h2>
            {!isSuccess && !isCreating && (
              <span className={styles.stepIndicator}>
                Step {step + 1} of 3 — {STEP_LABELS[step]}
              </span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close" type="button">
            <IconX />
          </button>
        </div>

        {/* Progress dots */}
        {!isSuccess && !isCreating && renderStepDots()}

        {/* Body */}
        <div className={styles.body}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </div>

        {/* Footer */}
        {!isCreating && (
          <div className={styles.footer}>
            <div>
              {step > 0 && !isSuccess && (
                <button className={styles.btnSecondary} onClick={goBack} type="button">
                  Back
                </button>
              )}
            </div>
            <div className={styles.footerRight}>
              {!isSuccess && (
                <button className={styles.btnSecondary} onClick={onClose} type="button">
                  Cancel
                </button>
              )}
              {step < 2 && !isSuccess && (
                <button
                  className={styles.btnPrimary}
                  onClick={goNext}
                  disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
                  type="button"
                >
                  Next
                </button>
              )}
              {step === 2 && !isSuccess && (
                <button className={styles.btnPrimary} onClick={handleCreate} type="button">
                  Create DataRoom
                </button>
              )}
              {isSuccess && (
                <button className={styles.btnPrimary} onClick={handleDone} type="button">
                  Open DataRoom
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateDataRoomModal;
