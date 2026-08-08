import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import styles from "./RichTextEditor.module.css";
import { 
  FiBold, FiItalic, FiList, FiMenu, FiCode 
} from "react-icons/fi";

const RichTextEditor = ({ content, onChange, storageKey = "draft_assignment_content" }) => {

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write your assignment instructions here...",
      }),
    ],
    content: content || localStorage.getItem(storageKey) || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      // Auto-save draft locally
      localStorage.setItem(storageKey, html);
    },
  });

  // Keep editor synced if content prop changes externally (e.g. loading edit mode)
  useEffect(() => {
    if (editor && content && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={styles.editorContainer}>
      <div className={styles.toolbar}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${styles.toolbarBtn} ${editor.isActive("bold") ? styles.active : ""}`}
          title="Bold"
        >
          <FiBold />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${styles.toolbarBtn} ${editor.isActive("italic") ? styles.active : ""}`}
          title="Italic"
        >
          <FiItalic />
        </button>
        <div className={styles.divider}></div>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${styles.toolbarBtn} ${editor.isActive("bulletList") ? styles.active : ""}`}
          title="Bullet List"
        >
          <FiList />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`${styles.toolbarBtn} ${editor.isActive("orderedList") ? styles.active : ""}`}
          title="Numbered List"
        >
          <FiMenu />
        </button>
        <div className={styles.divider}></div>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`${styles.toolbarBtn} ${editor.isActive("codeBlock") ? styles.active : ""}`}
          title="Code Block"
        >
          <FiCode />
        </button>
      </div>
      
      <div className={styles.editorContentWrapper}>
        <EditorContent editor={editor} className={styles.tiptapEditor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
