/**
 * THINKRIGHT - SCIENTIFIC CALCULATOR MODULE
 * 
 * Provides an on-screen scientific calculator for CBT tests in calculation-heavy
 * subjects (Mathematics, Physics, Chemistry, Economics).
 * 
 * Features:
 * - Mathematical parser & evaluator (safe, zero eval(), operator precedence)
 * - Trigonometry with DEG / RAD modes (default: DEG) & Inverse Trig (INV)
 * - Powers & Roots: x², x³, x^y, √, ∛, 1/x
 * - Logarithms & Exponents: log₁₀, ln, 10^x, e^x
 * - Constants: π, e, previous answer (Ans)
 * - Factorials: n!
 * - Floating point precision correction
 * - Responsive modal (bottom-sheet on mobile, centered dialog on desktop)
 * - Physical keyboard support & anti-cheat safe (native DOM, no blur/unload triggers)
 */

(function (window, document) {
    'use strict';

    // Calculation-heavy subjects that enable the calculator button
    const CALCULATOR_SUBJECTS = new Set([
        'mathematics',
        'maths',
        'math',
        'physics',
        'chemistry',
        'economics',
        'further_mathematics',
        'further_maths'
    ]);

    // State
    const state = {
        expression: '',          // Full expression being built
        currentDisplay: '0',     // Text displayed on the main display
        historyDisplay: '',      // Text displayed on the history sub-display
        lastAnswer: 0,           // 'Ans' register
        angleMode: 'DEG',        // 'DEG' or 'RAD'
        isInverse: false,        // If INV / 2nd mode is active
        isEvaluated: false,      // If current display is the result of '='
        isOpen: false,           // Modal visibility state
    };

    // DOM references
    let dom = {
        modal: null,
        toggleBtn: null,
        historyEl: null,
        displayEl: null,
        modeBadge: null,
        degRadBtn: null,
        invBtn: null,
        closeBtn: null,
        questionCard: null,
        questionBadge: null,
        questionBody: null,
    };

    // =========================================================================
    // 1. MATHEMATICAL EVALUATION ENGINE (SAFE SHUNTING-YARD / TOKENIZER)
    // =========================================================================

    /**
     * Clean floating point rounding errors (e.g. 0.1 + 0.2 => 0.3)
     */
    function cleanNumber(num) {
        if (!Number.isFinite(num)) return num;
        // Fix trig edge cases in DEG mode
        if (Math.abs(num) < 1e-12) return 0;
        const prec = parseFloat(num.toPrecision(12));
        return prec;
    }

    /**
     * Format a numerical output for display
     */
    function formatOutput(num) {
        if (!Number.isFinite(num)) {
            if (Number.isNaN(num)) return 'Error';
            return num > 0 ? 'Infinity' : '-Infinity';
        }
        const cleaned = cleanNumber(num);
        if (Math.abs(cleaned) > 1e12 || (Math.abs(cleaned) < 1e-6 && cleaned !== 0)) {
            return cleaned.toExponential(6).replace(/\+?0*(\d+)$/, '$1');
        }
        return String(cleaned);
    }

    /**
     * Factorial function n!
     */
    function factorial(n) {
        if (!Number.isInteger(n) || n < 0) return NaN;
        if (n === 0 || n === 1) return 1;
        if (n > 170) return Infinity;
        let res = 1;
        for (let i = 2; i <= n; i++) res *= i;
        return res;
    }

    /**
     * Tokenize mathematical expression string
     */
    function tokenize(raw) {
        const tokens = [];
        let i = 0;
        const str = raw
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/π/g, 'PI')
            .replace(/√/g, 'sqrt')
            .replace(/∛/g, 'cbrt')
            .replace(/\s+/g, '');

        while (i < str.length) {
            const ch = str[i];

            // Digits & decimal
            if ((ch >= '0' && ch <= '9') || ch === '.') {
                let numStr = ch;
                i++;
                while (i < str.length && ((str[i] >= '0' && str[i] <= '9') || str[i] === '.')) {
                    numStr += str[i];
                    i++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            // Identifiers / functions / constants
            if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z') {
                let id = ch;
                i++;
                while (i < str.length && (str[i] >= 'a' && str[i] <= 'z' || str[i] >= 'A' && str[i] <= 'Z' || str[i] >= '0' && str[i] <= '9')) {
                    id += str[i];
                    i++;
                }

                if (id === 'PI') {
                    tokens.push({ type: 'NUMBER', value: Math.PI });
                } else if (id === 'e') {
                    tokens.push({ type: 'NUMBER', value: Math.E });
                } else if (id === 'Ans') {
                    tokens.push({ type: 'NUMBER', value: state.lastAnswer });
                } else {
                    tokens.push({ type: 'FUNC', value: id });
                }
                continue;
            }

            // Operators
            if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '^' || ch === '!') {
                // Check if '-' or '+' is a unary operator
                const prev = tokens[tokens.length - 1];
                if ((ch === '-' || ch === '+') && (!prev || prev.type === 'OP' || (prev.type === 'PUNCT' && prev.value === '('))) {
                    if (ch === '-') {
                        tokens.push({ type: 'UNARY_MINUS', value: 'u-' });
                    }
                } else {
                    tokens.push({ type: 'OP', value: ch });
                }
                i++;
                continue;
            }

            // Parentheses
            if (ch === '(' || ch === ')') {
                tokens.push({ type: 'PUNCT', value: ch });
                i++;
                continue;
            }

            // Skip unknown
            i++;
        }

        return tokens;
    }

    /**
     * Operator precedence
     */
    const PRECEDENCE = {
        '+': 1,
        '-': 1,
        '*': 2,
        '/': 2,
        '%': 2,
        '^': 4,
        'u-': 3,
        '!': 5,
    };

    /**
     * Evaluate expression using Shunting-Yard -> RPN algorithm
     */
    function evaluateExpression(exprString) {
        if (!exprString || !exprString.trim()) return 0;
        const tokens = tokenize(exprString);
        if (!tokens.length) return 0;

        // Auto-close missing right parentheses
        let openParenCount = 0;
        tokens.forEach(t => {
            if (t.type === 'PUNCT' && t.value === '(') openParenCount++;
            if (t.type === 'PUNCT' && t.value === ')') openParenCount--;
        });
        while (openParenCount > 0) {
            tokens.push({ type: 'PUNCT', value: ')' });
            openParenCount--;
        }

        // Shunting-yard to produce RPN
        const outputQueue = [];
        const opStack = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.type === 'NUMBER') {
                outputQueue.push(token);
            } else if (token.type === 'FUNC') {
                opStack.push(token);
            } else if (token.type === 'OP' || token.type === 'UNARY_MINUS') {
                const o1 = token.value;
                const p1 = PRECEDENCE[o1] || 0;
                const isRightAssoc = o1 === '^' || token.type === 'UNARY_MINUS';

                while (opStack.length > 0) {
                    const top = opStack[opStack.length - 1];
                    if (top.type === 'PUNCT' && top.value === '(') break;

                    const p2 = PRECEDENCE[top.value] || (top.type === 'FUNC' ? 6 : 0);
                    if ((!isRightAssoc && p1 <= p2) || (isRightAssoc && p1 < p2)) {
                        outputQueue.push(opStack.pop());
                    } else {
                        break;
                    }
                }
                opStack.push(token);
            } else if (token.type === 'PUNCT' && token.value === '(') {
                opStack.push(token);
            } else if (token.type === 'PUNCT' && token.value === ')') {
                while (opStack.length > 0 && !(opStack[opStack.length - 1].type === 'PUNCT' && opStack[opStack.length - 1].value === '(')) {
                    outputQueue.push(opStack.pop());
                }
                if (opStack.length > 0 && opStack[opStack.length - 1].type === 'PUNCT' && opStack[opStack.length - 1].value === '(') {
                    opStack.pop(); // discard '('
                }
                // If token at top of stack is a function, pop it to output
                if (opStack.length > 0 && opStack[opStack.length - 1].type === 'FUNC') {
                    outputQueue.push(opStack.pop());
                }
            }
        }

        while (opStack.length > 0) {
            outputQueue.push(opStack.pop());
        }

        // Evaluate RPN
        const evalStack = [];

        for (let i = 0; i < outputQueue.length; i++) {
            const token = outputQueue[i];

            if (token.type === 'NUMBER') {
                evalStack.push(token.value);
            } else if (token.type === 'UNARY_MINUS') {
                const a = evalStack.pop();
                if (a === undefined) return NaN;
                evalStack.push(-a);
            } else if (token.type === 'OP') {
                if (token.value === '!') {
                    const a = evalStack.pop();
                    if (a === undefined) return NaN;
                    evalStack.push(factorial(Math.round(a)));
                    continue;
                }

                const b = evalStack.pop();
                const a = evalStack.pop();
                if (a === undefined || b === undefined) return NaN;

                switch (token.value) {
                    case '+': evalStack.push(a + b); break;
                    case '-': evalStack.push(a - b); break;
                    case '*': evalStack.push(a * b); break;
                    case '/':
                        if (b === 0) return Infinity;
                        evalStack.push(a / b);
                        break;
                    case '%': evalStack.push(a % b); break;
                    case '^': evalStack.push(Math.pow(a, b)); break;
                    default: return NaN;
                }
            } else if (token.type === 'FUNC') {
                const a = evalStack.pop();
                if (a === undefined) return NaN;

                const fn = token.value.toLowerCase();
                const isDeg = state.angleMode === 'DEG';

                switch (fn) {
                    case 'sin': {
                        const angle = isDeg ? (a * Math.PI) / 180 : a;
                        evalStack.push(cleanNumber(Math.sin(angle)));
                        break;
                    }
                    case 'cos': {
                        const angle = isDeg ? (a * Math.PI) / 180 : a;
                        evalStack.push(cleanNumber(Math.cos(angle)));
                        break;
                    }
                    case 'tan': {
                        const angle = isDeg ? (a * Math.PI) / 180 : a;
                        // tan(90 deg) is undefined
                        if (isDeg && Math.abs(a % 180) === 90) {
                            return NaN;
                        }
                        evalStack.push(cleanNumber(Math.tan(angle)));
                        break;
                    }
                    case 'asin': {
                        if (a < -1 || a > 1) return NaN;
                        const rad = Math.asin(a);
                        evalStack.push(cleanNumber(isDeg ? (rad * 180) / Math.PI : rad));
                        break;
                    }
                    case 'acos': {
                        if (a < -1 || a > 1) return NaN;
                        const rad = Math.acos(a);
                        evalStack.push(cleanNumber(isDeg ? (rad * 180) / Math.PI : rad));
                        break;
                    }
                    case 'atan': {
                        const rad = Math.atan(a);
                        evalStack.push(cleanNumber(isDeg ? (rad * 180) / Math.PI : rad));
                        break;
                    }
                    case 'log': {
                        if (a <= 0) return NaN;
                        evalStack.push(cleanNumber(Math.log10(a)));
                        break;
                    }
                    case 'ln': {
                        if (a <= 0) return NaN;
                        evalStack.push(cleanNumber(Math.log(a)));
                        break;
                    }
                    case 'sqrt': {
                        if (a < 0) return NaN;
                        evalStack.push(cleanNumber(Math.sqrt(a)));
                        break;
                    }
                    case 'cbrt': {
                        evalStack.push(cleanNumber(Math.cbrt(a)));
                        break;
                    }
                    case 'exp': {
                        evalStack.push(cleanNumber(Math.exp(a)));
                        break;
                    }
                    case 'powten': {
                        evalStack.push(cleanNumber(Math.pow(10, a)));
                        break;
                    }
                    case 'inv': {
                        if (a === 0) return Infinity;
                        evalStack.push(cleanNumber(1 / a));
                        break;
                    }
                    case 'sq': {
                        evalStack.push(cleanNumber(a * a));
                        break;
                    }
                    case 'cube': {
                        evalStack.push(cleanNumber(a * a * a));
                        break;
                    }
                    default:
                        return NaN;
                }
            }
        }

        if (evalStack.length !== 1) return NaN;
        return evalStack[0];
    }

    // =========================================================================
    // 2. CALCULATOR UI & INTERACTION CONTROLLER
    // =========================================================================

    function updateDisplay() {
        if (!dom.displayEl) return;

        dom.displayEl.textContent = state.currentDisplay || '0';
        if (dom.historyEl) {
            dom.historyEl.textContent = state.historyDisplay || '';
        }

        // Error visual class
        if (state.currentDisplay === 'Error' || state.currentDisplay === 'Infinity' || state.currentDisplay === '-Infinity') {
            dom.displayEl.classList.add('is-error');
        } else {
            dom.displayEl.classList.remove('is-error');
        }

        // Mode badge
        if (dom.modeBadge) {
            dom.modeBadge.textContent = state.angleMode;
        }
    }

    function clearAll() {
        state.expression = '';
        state.currentDisplay = '0';
        state.historyDisplay = '';
        state.isEvaluated = false;
        updateDisplay();
    }

    function deleteChar() {
        if (state.isEvaluated || state.currentDisplay === 'Error') {
            clearAll();
            return;
        }

        if (state.expression.length > 0) {
            // Check if removing a multi-character token like 'sqrt(', 'asin(', etc.
            const funcs = ['sqrt(', 'cbrt(', 'asin(', 'acos(', 'atan(', 'log(', 'sin(', 'cos(', 'tan(', 'ln(', 'Ans'];
            let removed = false;
            for (const fn of funcs) {
                if (state.expression.endsWith(fn)) {
                    state.expression = state.expression.slice(0, -fn.length);
                    removed = true;
                    break;
                }
            }
            if (!removed) {
                state.expression = state.expression.slice(0, -1);
            }
            state.currentDisplay = state.expression || '0';
            updateDisplay();
        }
    }

    function appendInput(val) {
        if (state.currentDisplay === 'Error') {
            state.expression = '';
            state.currentDisplay = '0';
        }

        // If user just evaluated and enters a digit, start fresh
        if (state.isEvaluated) {
            state.isEvaluated = false;
            if (val >= '0' && val <= '9' || val === '.' || val === 'π' || val === 'e' || val.endsWith('(')) {
                state.expression = '';
            }
        }

        state.expression += val;
        state.currentDisplay = state.expression;
        updateDisplay();
    }

    function appendOperator(op) {
        if (state.currentDisplay === 'Error') return;

        if (state.isEvaluated) {
            state.isEvaluated = false;
        }

        if (!state.expression && state.lastAnswer) {
            state.expression = 'Ans';
        }

        state.expression += op;
        state.currentDisplay = state.expression;
        updateDisplay();
    }

    function toggleSign() {
        if (state.isEvaluated) {
            const num = parseFloat(state.currentDisplay);
            if (!Number.isNaN(num)) {
                const toggled = -num;
                state.currentDisplay = String(toggled);
                state.expression = String(toggled);
                state.lastAnswer = toggled;
                updateDisplay();
            }
            return;
        }

        // Wrap or unwrap current expression in -()
        if (state.expression.startsWith('-(') && state.expression.endsWith(')')) {
            state.expression = state.expression.slice(2, -1);
        } else if (state.expression) {
            state.expression = `-(${state.expression})`;
        } else {
            state.expression = '-';
        }
        state.currentDisplay = state.expression;
        updateDisplay();
    }

    function toggleAngleMode() {
        state.angleMode = state.angleMode === 'DEG' ? 'RAD' : 'DEG';
        if (dom.degRadBtn) {
            dom.degRadBtn.textContent = state.angleMode;
        }
        updateDisplay();
    }

    function toggleInverse() {
        state.isInverse = !state.isInverse;
        if (dom.invBtn) {
            if (state.isInverse) {
                dom.invBtn.classList.add('is-active');
            } else {
                dom.invBtn.classList.remove('is-active');
            }
        }

        // Toggle button labels for inverse functions
        const sinBtn = document.querySelector('[data-calc-action="sin"]');
        const cosBtn = document.querySelector('[data-calc-action="cos"]');
        const tanBtn = document.querySelector('[data-calc-action="tan"]');
        const logBtn = document.querySelector('[data-calc-action="log"]');
        const lnBtn = document.querySelector('[data-calc-action="ln"]');
        const sqrtBtn = document.querySelector('[data-calc-action="sqrt"]');

        if (state.isInverse) {
            if (sinBtn) sinBtn.innerHTML = 'sin<sup>-1</sup>';
            if (cosBtn) cosBtn.innerHTML = 'cos<sup>-1</sup>';
            if (tanBtn) tanBtn.innerHTML = 'tan<sup>-1</sup>';
            if (logBtn) logBtn.innerHTML = '10<sup>x</sup>';
            if (lnBtn) lnBtn.innerHTML = 'e<sup>x</sup>';
            if (sqrtBtn) sqrtBtn.innerHTML = '<sup>3</sup>√';
        } else {
            if (sinBtn) sinBtn.textContent = 'sin';
            if (cosBtn) cosBtn.textContent = 'cos';
            if (tanBtn) tanBtn.textContent = 'tan';
            if (logBtn) logBtn.textContent = 'log';
            if (lnBtn) lnBtn.textContent = 'ln';
            if (sqrtBtn) sqrtBtn.textContent = '√';
        }
    }

    function evaluate() {
        if (!state.expression && !state.historyDisplay) return;
        const exprToEval = state.expression || state.currentDisplay;

        try {
            const result = evaluateExpression(exprToEval);
            state.historyDisplay = `${exprToEval} =`;

            if (Number.isNaN(result) || result === undefined) {
                state.currentDisplay = 'Error';
            } else {
                state.currentDisplay = formatOutput(result);
                state.lastAnswer = result;
                state.expression = state.currentDisplay;
                state.isEvaluated = true;
            }
        } catch (e) {
            console.warn('[ScientificCalculator] Eval error:', e);
            state.currentDisplay = 'Error';
        }

        updateDisplay();
    }

    // =========================================================================
    // 3. KEYPAD ACTIONS DISPATCHER
    // =========================================================================

    function handleAction(action, value) {
        switch (action) {
            case 'num':
                appendInput(value);
                break;
            case 'op':
                appendOperator(value);
                break;
            case 'ac':
                clearAll();
                break;
            case 'del':
                deleteChar();
                break;
            case 'equals':
                evaluate();
                break;
            case 'pm':
                toggleSign();
                break;
            case 'deg-rad':
                toggleAngleMode();
                break;
            case 'inv':
                toggleInverse();
                break;
            case 'sin':
                appendInput(state.isInverse ? 'asin(' : 'sin(');
                break;
            case 'cos':
                appendInput(state.isInverse ? 'acos(' : 'cos(');
                break;
            case 'tan':
                appendInput(state.isInverse ? 'atan(' : 'tan(');
                break;
            case 'log':
                appendInput(state.isInverse ? '10^(' : 'log(');
                break;
            case 'ln':
                appendInput(state.isInverse ? 'e^(' : 'ln(');
                break;
            case 'sqrt':
                appendInput(state.isInverse ? 'cbrt(' : 'sqrt(');
                break;
            case 'square':
                appendOperator('^2');
                break;
            case 'power':
                appendOperator('^');
                break;
            case 'inv-x':
                appendInput('inv(');
                break;
            case 'fact':
                appendOperator('!');
                break;
            case 'pi':
                appendInput('π');
                break;
            case 'e':
                appendInput('e');
                break;
            case 'ans':
                appendInput('Ans');
                break;
            case 'paren-open':
                appendInput('(');
                break;
            case 'paren-close':
                appendInput(')');
                break;
            case 'percent':
                appendOperator('%');
                break;
            default:
                break;
        }
    }

    // =========================================================================
    // 4. MODAL CONTROLS & LIFECYCLE
    // =========================================================================

    function updateQuestionPreview(questionText, currentIndex, totalQuestions) {
        if (!dom.questionBody) {
            dom.questionBody = document.getElementById('calcQuestionBody');
        }
        if (!dom.questionBadge) {
            dom.questionBadge = document.getElementById('calcQuestionBadge');
        }

        if (dom.questionBadge) {
            if (typeof currentIndex === 'number' && typeof totalQuestions === 'number') {
                dom.questionBadge.textContent = `Question ${currentIndex + 1} of ${totalQuestions}`;
            } else {
                const counterEl = document.getElementById('questionCounter');
                dom.questionBadge.textContent = counterEl ? `Question ${counterEl.textContent.trim()}` : 'Question';
            }
        }

        if (dom.questionBody) {
            if (questionText) {
                dom.questionBody.innerHTML = questionText;
            } else {
                const questionTextEl = document.getElementById('questionText');
                if (questionTextEl) {
                    dom.questionBody.innerHTML = questionTextEl.innerHTML;
                }
            }
        }
    }

    function openModal() {
        if (!dom.modal) return;
        updateQuestionPreview();
        dom.modal.classList.add('is-open');
        dom.modal.setAttribute('aria-hidden', 'false');
        state.isOpen = true;
        updateDisplay();
    }

    function closeModal() {
        if (!dom.modal) return;
        dom.modal.classList.remove('is-open');
        dom.modal.setAttribute('aria-hidden', 'true');
        state.isOpen = false;
    }

    function toggleModal() {
        if (state.isOpen) closeModal();
        else openModal();
    }

    /**
     * Check if a subject should display the calculator button
     */
    function shouldShowCalculator(subject) {
        if (!subject) return false;
        let normalized = subject.toString().trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
        if (typeof window.normalizeSubject === 'function') {
            normalized = window.normalizeSubject(subject);
        }
        return CALCULATOR_SUBJECTS.has(normalized);
    }

    /**
     * Public method to check and update calculator toggle visibility
     */
    function checkSubject(subject) {
        if (!dom.toggleBtn) {
            dom.toggleBtn = document.getElementById('calcToggleBtn');
        }
        if (!dom.toggleBtn) return;

        if (shouldShowCalculator(subject)) {
            dom.toggleBtn.style.setProperty('display', 'inline-flex', 'important');
            dom.toggleBtn.classList.remove('is-hidden');
            dom.toggleBtn.removeAttribute('hidden');
            dom.toggleBtn.setAttribute('aria-hidden', 'false');
        } else {
            dom.toggleBtn.style.setProperty('display', 'none', 'important');
            dom.toggleBtn.classList.add('is-hidden');
            dom.toggleBtn.setAttribute('hidden', '');
            dom.toggleBtn.setAttribute('aria-hidden', 'true');
            closeModal();
        }
    }

    // =========================================================================
    // 5. EVENT LISTENERS SETUP
    // =========================================================================

    function setupEventListeners() {
        // Toggle button
        if (dom.toggleBtn) {
            dom.toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleModal();
            });
        }

        // Close button
        if (dom.closeBtn) {
            dom.closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal();
            });
        }

        // Backdrop click
        if (dom.modal) {
            dom.modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('calc-backdrop') || e.target === dom.modal) {
                    closeModal();
                }
            });
        }

        // Keypad buttons click delegation
        const keypad = document.getElementById('calcKeypad');
        if (keypad) {
            keypad.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-calc-action]');
                if (!btn) return;
                e.preventDefault();
                const action = btn.getAttribute('data-calc-action');
                const value = btn.getAttribute('data-calc-val');
                handleAction(action, value);
            });
        }

        // Mode and Inv buttons in header
        if (dom.degRadBtn) {
            dom.degRadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleAngleMode();
            });
        }

        if (dom.invBtn) {
            dom.invBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleInverse();
            });
        }

        // Physical Keyboard listener (only active while calculator modal is open)
        document.addEventListener('keydown', (e) => {
            if (!state.isOpen) return;

            // Prevent shortcuts like / from focusing browser search
            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                appendInput(e.key);
            } else if (e.key === '.') {
                e.preventDefault();
                appendInput('.');
            } else if (e.key === '+' || e.key === '-') {
                e.preventDefault();
                appendOperator(e.key);
            } else if (e.key === '*') {
                e.preventDefault();
                appendOperator('*');
            } else if (e.key === '/') {
                e.preventDefault();
                appendOperator('/');
            } else if (e.key === '%') {
                e.preventDefault();
                appendOperator('%');
            } else if (e.key === '^') {
                e.preventDefault();
                appendOperator('^');
            } else if (e.key === '!') {
                e.preventDefault();
                appendOperator('!');
            } else if (e.key === '(' || e.key === ')') {
                e.preventDefault();
                appendInput(e.key);
            } else if (e.key === 'Enter' || e.key === '=') {
                e.preventDefault();
                evaluate();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                deleteChar();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
            }
        });
    }

    function init() {
        dom.modal = document.getElementById('calcModal');
        dom.toggleBtn = document.getElementById('calcToggleBtn');
        dom.historyEl = document.getElementById('calcHistory');
        dom.displayEl = document.getElementById('calcDisplay');
        dom.modeBadge = document.getElementById('calcModeBadge');
        dom.degRadBtn = document.getElementById('calcDegRadBtn');
        dom.invBtn = document.getElementById('calcInvBtn');
        dom.closeBtn = document.getElementById('calcCloseBtn');
        dom.questionCard = document.getElementById('calcQuestionCard');
        dom.questionBadge = document.getElementById('calcQuestionBadge');
        dom.questionBody = document.getElementById('calcQuestionBody');

        setupEventListeners();
        updateDisplay();
    }

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose public API
    window.ScientificCalculator = {
        open: openModal,
        close: closeModal,
        toggle: toggleModal,
        checkSubject: checkSubject,
        shouldShowCalculator: shouldShowCalculator,
        evaluate: evaluateExpression,
        formatOutput: formatOutput,
        clear: clearAll,
        syncQuestion: updateQuestionPreview,
    };

})(window, document);
