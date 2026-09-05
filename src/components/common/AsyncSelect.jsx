import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./AsyncSelect.module.css";

const AsyncSelect = ({
  name,
  value,
  onChange,
  loadOptions,
  getOptionLabel,
  getOptionValue,
  placeholder = "Search...",
  debounceTimeout = 300,
  defaultOption = null,
  disabled = false,
  required = false
}) => {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(defaultOption);

  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const latestRequestRef = useRef(0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync selectedOption with external value changes (e.g. initial load or programmatic clear)
  useEffect(() => {
    if (!value) {
      setSelectedOption(null);
      setInputValue("");
    } else if (defaultOption && getOptionValue(defaultOption) === value) {
       setSelectedOption(defaultOption);
       setInputValue(getOptionLabel(defaultOption));
    }
  }, [value, defaultOption, getOptionValue, getOptionLabel]);

  const fetchOptions = useCallback(async (searchQuery) => {
    setIsLoading(true);
    const requestId = Date.now();
    latestRequestRef.current = requestId;

    try {
      const results = await loadOptions(searchQuery);
      // Prevent stale response overwrite
      if (latestRequestRef.current === requestId) {
        setOptions(results || []);
      }
    } catch (error) {
      console.error("Failed to load options:", error);
      if (latestRequestRef.current === requestId) {
        setOptions([]);
      }
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [loadOptions]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setIsOpen(true);
    
    // Clear selection if user types
    if (selectedOption && getOptionLabel(selectedOption) !== val) {
      setSelectedOption(null);
      // Trigger onChange with empty value to notify parent
      onChange({ target: { name, value: "" } });
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchOptions(val);
    }, debounceTimeout);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (options.length === 0 && !inputValue) {
      fetchOptions("");
    }
  };

  const handleOptionClick = (option) => {
    setSelectedOption(option);
    setInputValue(getOptionLabel(option));
    setIsOpen(false);
    onChange({ target: { name, value: getOptionValue(option) } });
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedOption(null);
    setInputValue("");
    setOptions([]);
    onChange({ target: { name, value: "" } });
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={`${styles.inputWrapper} ${disabled ? styles.disabled : ''}`}>
        <input
          type="text"
          className={styles.input}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !selectedOption}
          autoComplete="off"
        />
        {isLoading && <span className={styles.spinner}></span>}
        {selectedOption && !disabled && (
          <button type="button" className={styles.clearBtn} onClick={handleClear} aria-label="Clear selection">
            &times;
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <ul className={styles.dropdown}>
          {isLoading && options.length === 0 ? (
            <li className={styles.statusItem}>Loading...</li>
          ) : options.length > 0 ? (
            options.map((option, index) => (
              <li
                key={index}
                className={styles.optionItem}
                onClick={() => handleOptionClick(option)}
              >
                {getOptionLabel(option)}
              </li>
            ))
          ) : (
            <li className={styles.statusItem}>No results found</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default AsyncSelect;
