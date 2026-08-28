import React, { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import styles from "./RichTextEditor.module.css";
import { 
  FiBold, FiItalic, FiUnderline, FiType, FiAlignLeft, FiAlignCenter, 
  FiAlignRight, FiAlignJustify, FiList, FiMenu, FiCode, FiLink, FiImage,
  FiFileText, FiCornerUpLeft, FiCornerUpRight
} from "react-icons/fi";

const MenuBar = ({ editor }) => {
  if (!editor) return null;

  return (
    <div className={styles.wordRibbon}>
      {/* Undo / Redo */}
      <div className={styles.toolbarGroup}>
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={styles.toolbarBtn} title="Undo">
          <FiCornerUpLeft />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={styles.toolbarBtn} title="Redo">
          <FiCornerUpRight />
        </button>
      </div>
      <div className={styles.divider}></div>

      {/* Headings */}
      <div className={styles.toolbarGroup}>
        <select 
          className={styles.headingSelect}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: parseInt(val) }).run();
          }}
          value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'}
        >
          <option value="p">Normal Text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
      </div>
      <div className={styles.divider}></div>

      {/* Formatting */}
      <div className={styles.toolbarGroup}>
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`${styles.toolbarBtn} ${editor.isActive("bold") ? styles.active : ""}`} title="Bold">
          <FiBold />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`${styles.toolbarBtn} ${editor.isActive("italic") ? styles.active : ""}`} title="Italic">
          <FiItalic />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${styles.toolbarBtn} ${editor.isActive("underline") ? styles.active : ""}`} title="Underline">
          <FiUnderline />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={`${styles.toolbarBtn} ${editor.isActive("strike") ? styles.active : ""}`} title="Strikethrough">
          <del style={{ fontWeight: 600 }}>S</del>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={`${styles.toolbarBtn} ${editor.isActive("highlight") ? styles.active : ""}`} title="Highlight">
          <span style={{ backgroundColor: 'yellow', padding: '0 2px' }}>A</span>
        </button>
      </div>
      <div className={styles.divider}></div>

      {/* Alignment */}
      <div className={styles.toolbarGroup}>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'left' }) ? styles.active : ""}`} title="Align Left">
          <FiAlignLeft />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'center' }) ? styles.active : ""}`} title="Align Center">
          <FiAlignCenter />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'right' }) ? styles.active : ""}`} title="Align Right">
          <FiAlignRight />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'justify' }) ? styles.active : ""}`} title="Justify">
          <FiAlignJustify />
        </button>
      </div>
      <div className={styles.divider}></div>

      {/* Lists & Extras */}
      <div className={styles.toolbarGroup}>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`${styles.toolbarBtn} ${editor.isActive("bulletList") ? styles.active : ""}`} title="Bullet List">
          <FiList />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`${styles.toolbarBtn} ${editor.isActive("orderedList") ? styles.active : ""}`} title="Numbered List">
          <FiMenu />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`${styles.toolbarBtn} ${editor.isActive("codeBlock") ? styles.active : ""}`} title="Code Block">
          <FiCode />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`${styles.toolbarBtn} ${editor.isActive("blockquote") ? styles.active : ""}`} title="Quote">
          <FiFileText />
        </button>
      </div>
    </div>
  );
};

const RichTextEditor = ({ content, onChange, storageKey = "draft_assignment_content" }) => {

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder: "Write your assignment instructions here... (Type text to start formatting)",
      }),
    ],
    content: content || localStorage.getItem(storageKey) || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      localStorage.setItem(storageKey, html);
    },
  });

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
      <MenuBar editor={editor} />
      <div className={styles.editorContentWrapper}>
        <EditorContent editor={editor} className={styles.tiptapEditor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
