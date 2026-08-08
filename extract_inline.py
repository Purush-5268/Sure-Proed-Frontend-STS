import os
import re

base_dir = '/home/purush/projects/Sure-Proed-V2/Frontend/src/pages/admin'

def camel_to_kebab(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1-\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1-\2', s1).lower()

def parse_inline_style(style_str):
    """Parses a static style dictionary string into a CSS ruleset string."""
    # Remove outer braces
    style_str = style_str.strip()[1:-1].strip()
    
    rules = []
    # Match key: value pairs, handling strings with quotes
    # This is a naive regex for simple static styles
    pattern = r'([a-zA-Z0-9_]+)\s*:\s*([^,]+)'
    for match in re.finditer(pattern, style_str):
        key = match.group(1).strip()
        val = match.group(2).strip()
        
        # If value has dynamic stuff (like variables, ternaries), skip the whole thing
        if '?' in val or '`' in val or '${' in val or val.replace("'", "").replace('"', '').isalpha() == False and any(c in val for c in ['+', '-', '*', '/']) and 'var(' not in val and 'rgba(' not in val and 'calc(' not in val and 'px' not in val and '%' not in val and 'rem' not in val:
             # Basic heuristic to detect dynamic JS expressions
             if val not in ["'100%'", '"100%"'] and not val.startswith('"') and not val.startswith("'") and not val.isdigit():
                return None
                
        # Clean up quotes from static string values
        if val.startswith(('"', "'")) and val.endswith(('"', "'")):
            val = val[1:-1]
            
        css_key = camel_to_kebab(key)
        rules.append(f"  {css_key}: {val};")
        
    return "\n".join(rules)


modified_files = 0
extracted_classes = 0

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.jsx'):
            jsx_path = os.path.join(root, file)
            css_path = jsx_path.replace('.jsx', '.module.css')
            
            if not os.path.exists(css_path):
                continue
                
            with open(jsx_path, 'r') as f:
                jsx_content = f.read()
                
            # Find all style={{ ... }}
            style_matches = re.finditer(r'style=\{\{(.*?)\}\}', jsx_content, re.DOTALL)
            
            new_jsx_content = jsx_content
            new_css_append = []
            
            # Process in reverse to not mess up indices if we were doing string replacement by index
            # But we can just use re.sub with a function
            
            class_counter = 1
            
            def replacer(match):
                global extracted_classes
                style_body = match.group(1)
                
                # Check if it's purely static (no JS variables/ternaries inside)
                # A quick check for dynamic JS:
                if '?' in style_body or '`' in style_body or '${' in style_body or '=>' in style_body:
                    return match.group(0) # Skip
                
                # Try to parse
                css_rules = parse_inline_style('{' + style_body + '}')
                if not css_rules:
                    return match.group(0) # Skip if parse fails or dynamic detected
                    
                nonlocal class_counter
                class_name = f"extractedStyle{class_counter}"
                class_counter += 1
                
                new_css_append.append(f".{class_name} {{\n{css_rules}\n}}\n")
                extracted_classes += 1
                
                # Now we need to merge this into className.
                # This is tricky via regex because className might already exist.
                # For simplicity in this script, we'll return a special marker to inject className
                return f'className={{styles.{class_name}}}'
                
            
            # This simple replacement doesn't merge with existing classNames. 
            # We will use a more robust regex to handle existing className
            
            def advanced_replacer(match):
                # match.group(0) is the entire element tag, e.g., <div className={styles.foo} style={{...}}>
                # This is too complex for simple regex.
                pass
            
            # Let's just do the simple replacement first, assuming if it has style, we replace style with className.
            # If it already had className, we'd have two classNames, which is invalid JSX.
            # So let's write a smarter regex that finds the whole tag.
            
            tag_pattern = r'<([a-zA-Z0-9]+)\s+([^>]*?)style=\{\{(.*?)\}\}([^>]*?)>'
            
            def tag_replacer(match):
                global extracted_classes, class_counter
                
                tag = match.group(1)
                before_style = match.group(2)
                style_body = match.group(3)
                after_style = match.group(4)
                
                if '?' in style_body or '`' in style_body or '${' in style_body or '=>' in style_body or '&&' in style_body:
                    return match.group(0)
                    
                css_rules = parse_inline_style('{' + style_body + '}')
                if not css_rules:
                    return match.group(0)
                    
                class_name = f"{tag}Style{class_counter}"
                class_counter += 1
                
                new_css_append.append(f".{class_name} {{\n{css_rules}\n}}\n")
                extracted_classes += 1
                
                # Check for existing className
                existing_class_match_before = re.search(r'className=\{([^}]+)\}', before_style)
                existing_class_match_after = re.search(r'className=\{([^}]+)\}', after_style)
                
                if existing_class_match_before or existing_class_match_after:
                    # Too complex to merge safely via regex, just skip to avoid breaking logic
                    return match.group(0)
                else:
                    return f'<{tag} {before_style}className={{styles.{class_name}}}{after_style}>'
            
            new_jsx_content = re.sub(tag_pattern, tag_replacer, jsx_content, flags=re.DOTALL)
            
            if new_css_append:
                # Need to ensure 'styles' is imported
                if 'import styles from' not in new_jsx_content and 'import styles' not in new_jsx_content:
                    import_statement = f'import styles from "./{os.path.basename(css_path)}";\n'
                    # Inject after other imports
                    last_import = new_jsx_content.rfind('import ')
                    if last_import != -1:
                        end_of_last_import = new_jsx_content.find('\n', last_import) + 1
                        new_jsx_content = new_jsx_content[:end_of_last_import] + import_statement + new_jsx_content[end_of_last_import:]
                    else:
                        new_jsx_content = import_statement + new_jsx_content
                
                with open(jsx_path, 'w') as f:
                    f.write(new_jsx_content)
                
                with open(css_path, 'a') as f:
                    f.write('\n' + '\n'.join(new_css_append))
                
                modified_files += 1
                print(f"Extracted {len(new_css_append)} styles from {file}")

print(f"Refactored {modified_files} files, extracted {extracted_classes} classes.")
