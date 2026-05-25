import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  TextStyle,
  PanResponder,
  Modal,
  FlatList,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { evaluate } from 'mathjs';

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

interface UndoRedoState {
  value: string;
  prevValue: string | null;
  operator: string | null;
  waitingForNewValue: boolean;
}

export default function Calculator() {
  // Core state
  const [currentValue, setCurrentValue] = useState<string>('0');
  const [operator, setOperator] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState<boolean>(false);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);
  const [showScientific, setShowScientific] = useState<boolean>(false);
  const [expressionMode, setExpressionMode] = useState<boolean>(false);
  const [expression, setExpression] = useState<string>('');
  
  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<UndoRedoState[]>([]);
  const [redoStack, setRedoStack] = useState<UndoRedoState[]>([]);
  
  // Memory and constants
  const [memory, setMemory] = useState<number>(0);
  const [userConstants, setUserConstants] = useState<Record<string, number>>({});
  const [constantName, setConstantName] = useState<string>('');
  const [constantModalVisible, setConstantModalVisible] = useState<boolean>(false);
  
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const buttonSize = Math.min((width - (isLandscape ? 100 : 70)) / 4, 82);

  // Save state for undo
  const saveToUndo = () => {
    const newState: UndoRedoState = {
      value: currentValue,
      prevValue: previousValue,
      operator: operator,
      waitingForNewValue: waitingForNewValue,
    };
    setUndoStack(prev => [...prev, newState]);
    setRedoStack([]);
  };

  // Undo operation
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    
    // Save current to redo
    const currentState: UndoRedoState = {
      value: currentValue,
      prevValue: previousValue,
      operator: operator,
      waitingForNewValue: waitingForNewValue,
    };
    setRedoStack(prev => [...prev, currentState]);
    
    // Restore last state
    setCurrentValue(lastState.value);
    setPreviousValue(lastState.prevValue);
    setOperator(lastState.operator);
    setWaitingForNewValue(lastState.waitingForNewValue);
    setUndoStack(newUndoStack);
    lightHaptic();
  };

  // Redo operation
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    // Save current to undo
    const currentState: UndoRedoState = {
      value: currentValue,
      prevValue: previousValue,
      operator: operator,
      waitingForNewValue: waitingForNewValue,
    };
    setUndoStack(prev => [...prev, currentState]);
    
    // Restore next state
    setCurrentValue(nextState.value);
    setPreviousValue(nextState.prevValue);
    setOperator(nextState.operator);
    setWaitingForNewValue(nextState.waitingForNewValue);
    setRedoStack(newRedoStack);
    lightHaptic();
  };

  // Swipe gestures for undo/redo
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 50) {
          if (gestureState.dx > 0) {
            handleRedo(); // Swipe right = redo
          } else {
            handleUndo(); // Swipe left = undo
          }
        }
      },
    })
  ).current;

  // Haptic feedback
  const lightHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      // Fallback - no haptics
    }
  };

  // History management
  const addToHistory = (expression: string, result: string) => {
    if (result === 'Error') return;
    const newEntry: HistoryEntry = {
      id: Date.now().toString(),
      expression,
      result,
      timestamp: Date.now(),
    };
    setHistory((prev) => [newEntry, ...prev].slice(0, 50));
  };

  const clearHistory = () => setHistory([]);
  
  const loadHistoryItem = (entry: HistoryEntry) => {
    saveToUndo();
    setCurrentValue(entry.result);
    setPreviousValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
    setHistoryVisible(false);
    lightHaptic();
  };

  const exportHistory = async () => {
    if (history.length === 0) {
      Alert.alert('No History', 'Nothing to export yet.');
      return;
    }
    const data = JSON.stringify(history, null, 2);
    const path = FileSystem.Paths.document.uri + 'calculator_history.json';
    await FileSystem.writeAsStringAsync(path, data);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  };

  // Expression evaluation
  const evaluateExpression = () => {
    try {
      const result = evaluate(expression);
      const resultStr = parseFloat(result.toPrecision(10)).toString();
      addToHistory(expression, formatValue(resultStr));
      saveToUndo();
      setCurrentValue(resultStr);
      setExpression('');
      setExpressionMode(false);
      setWaitingForNewValue(true);
    } catch (err) {
      setCurrentValue('Error');
    }
  };

  // Basic arithmetic
  const calculate = (prev: string | null, current: string, op: string) => {
    if (!prev) return current;
    const prevNum = parseFloat(prev);
    const currentNum = parseFloat(current);
    if (isNaN(prevNum) || isNaN(currentNum)) return currentNum.toString();

    let result = 0;
    switch (op) {
      case '+':
        result = prevNum + currentNum;
        break;
      case '−':
        result = prevNum - currentNum;
        break;
      case '×':
        result = prevNum * currentNum;
        break;
      case '÷':
        if (currentNum === 0) return 'Error';
        result = prevNum / currentNum;
        break;
      case '^':
        result = Math.pow(prevNum, currentNum);
        break;
      case '%':
        result = prevNum % currentNum;
        break;
      default:
        return current.toString();
    }
    if (Math.abs(result) < 1e-10) result = 0;
    return parseFloat(result.toPrecision(10)).toString();
  };

  const handleOperator = (op: string) => {
    if (expressionMode) {
      setExpression(prev => prev + ' ' + op + ' ');
      return;
    }
    lightHaptic();
    saveToUndo();
    if (operator && !waitingForNewValue) {
      const result = calculate(previousValue, currentValue, operator);
      setCurrentValue(result);
      setPreviousValue(result);
    } else {
      setPreviousValue(currentValue);
    }
    setOperator(op);
    setWaitingForNewValue(true);
  };

  const handleEqual = () => {
    if (expressionMode) {
      evaluateExpression();
      return;
    }
    lightHaptic();
    if (!operator) return;
    const result = calculate(previousValue, currentValue, operator);
    const expressionStr = `${formatValue(previousValue!)} ${operator} ${formatValue(currentValue)}`;
    addToHistory(expressionStr, formatValue(result));
    saveToUndo();
    setCurrentValue(result);
    setPreviousValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
  };

  const handleNumber = (num: number | string) => {
    if (expressionMode) {
      setExpression(prev => prev + num.toString());
      return;
    }
    lightHaptic();
    saveToUndo();
    if (waitingForNewValue) {
      setCurrentValue(num.toString());
      setWaitingForNewValue(false);
    } else {
      if (currentValue === 'Error') {
        setCurrentValue(num.toString());
      } else {
        const raw = currentValue.replace(/,/g, '');
        if (raw.replace('.', '').replace('-', '').length >= 9) return;
        setCurrentValue(currentValue === '0' ? num.toString() : currentValue + num.toString());
      }
    }
  };

  const handleBackspace = () => {
    if (expressionMode) {
      setExpression(prev => prev.slice(0, -1));
      return;
    }
    lightHaptic();
    saveToUndo();
    setCurrentValue((prev) => {
      if (prev === 'Error' || prev.length === 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    if (expressionMode) {
      setExpression('');
      return;
    }
    lightHaptic();
    saveToUndo();
    if (currentValue !== '0') {
      setCurrentValue('0');
    } else {
      setOperator(null);
      setPreviousValue(null);
      setWaitingForNewValue(false);
    }
  };

  const handlePosNeg = () => {
    if (expressionMode) return;
    lightHaptic();
    saveToUndo();
    if (currentValue === 'Error') return;
    setCurrentValue((parseFloat(currentValue) * -1).toString());
  };

  const handlePercentage = () => {
    if (expressionMode) return;
    lightHaptic();
    saveToUndo();
    if (currentValue === 'Error') return;
    setCurrentValue((parseFloat(currentValue) / 100).toString());
  };

  const handleDecimal = () => {
    if (expressionMode) {
      if (!expression.includes('.')) setExpression(prev => prev + '.');
      return;
    }
    lightHaptic();
    if (waitingForNewValue) {
      setCurrentValue('0.');
      setWaitingForNewValue(false);
    } else if (!currentValue.includes('.')) {
      setCurrentValue(currentValue + '.');
    }
  };

  const handleParentheses = () => {
    setExpressionMode(true);
    setExpression(prev => prev + '()');
  };

  // Scientific Operations
  const applyUnaryOperation = (fn: (x: number) => number, symbol: string) => {
    if (currentValue === 'Error') return;
    const num = parseFloat(currentValue);
    if (isNaN(num)) return;
    let result = fn(num);
    if (isNaN(result) || !isFinite(result)) {
      setCurrentValue('Error');
      return;
    }
    result = parseFloat(result.toPrecision(10));
    const formattedResult = result.toString();
    addToHistory(`${symbol}(${formatValue(currentValue)})`, formatValue(formattedResult));
    saveToUndo();
    setCurrentValue(formattedResult);
    setWaitingForNewValue(true);
    lightHaptic();
  };

  const handleSin = () => applyUnaryOperation((x) => Math.sin(x * Math.PI / 180), 'sin');
  const handleCos = () => applyUnaryOperation((x) => Math.cos(x * Math.PI / 180), 'cos');
  const handleTan = () => applyUnaryOperation((x) => Math.tan(x * Math.PI / 180), 'tan');
  const handleLog = () => applyUnaryOperation((x) => Math.log10(x), 'log');
  const handleLn = () => applyUnaryOperation((x) => Math.log(x), 'ln');
  const handleSqrt = () => applyUnaryOperation((x) => Math.sqrt(x), '√');
  const handleSquare = () => applyUnaryOperation((x) => x * x, 'sqr');
  const handleReciprocal = () => applyUnaryOperation((x) => 1 / x, '1/x');
  const handleCubeRoot = () => applyUnaryOperation((x) => Math.cbrt(x), '∛');
  const handlePowerOfTen = () => applyUnaryOperation((x) => Math.pow(10, x), '10^x');
  
  const handleFactorial = () => {
    if (currentValue === 'Error') return;
    let n = parseFloat(currentValue);
    if (!Number.isInteger(n) || n < 0) {
      setCurrentValue('Error');
      return;
    }
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    if (result > 1e15) {
      setCurrentValue('Error');
      return;
    }
    addToHistory(`fact(${formatValue(currentValue)})`, result.toString());
    saveToUndo();
    setCurrentValue(result.toString());
    setWaitingForNewValue(true);
    lightHaptic();
  };

  const handlePi = () => {
    lightHaptic();
    saveToUndo();
    setCurrentValue(Math.PI.toString());
    setWaitingForNewValue(true);
  };
  
  const handleE = () => {
    lightHaptic();
    saveToUndo();
    setCurrentValue(Math.E.toString());
    setWaitingForNewValue(true);
  };

  const handleExponent = () => {
    if (expressionMode) {
      setExpression(prev => prev + '^');
      return;
    }
    lightHaptic();
    saveToUndo();
    if (operator && !waitingForNewValue) {
      const result = calculate(previousValue, currentValue, operator);
      setCurrentValue(result);
      setPreviousValue(result);
    } else {
      setPreviousValue(currentValue);
    }
    setOperator('^');
    setWaitingForNewValue(true);
  };

  const handleModulo = () => {
    if (operator && !waitingForNewValue) {
      const result = calculate(previousValue, currentValue, '%');
      setCurrentValue(result);
      setPreviousValue(result);
    } else {
      setPreviousValue(currentValue);
    }
    setOperator('%');
    setWaitingForNewValue(true);
  };

  // Memory functions
  const handleMemoryAdd = () => {
    lightHaptic();
    const val = parseFloat(currentValue);
    if (!isNaN(val)) setMemory(memory + val);
  };
  
  const handleMemorySubtract = () => {
    lightHaptic();
    const val = parseFloat(currentValue);
    if (!isNaN(val)) setMemory(memory - val);
  };
  
  const handleMemoryRecall = () => {
    lightHaptic();
    saveToUndo();
    setCurrentValue(memory.toString());
    setWaitingForNewValue(true);
  };
  
  const handleMemoryClear = () => {
    lightHaptic();
    setMemory(0);
  };

  // User constants
  const saveConstant = () => {
    if (constantName.trim()) {
      const val = parseFloat(currentValue);
      if (!isNaN(val)) {
        setUserConstants({ ...userConstants, [constantName]: val });
        setConstantName('');
        setConstantModalVisible(false);
      }
    }
  };

  const recallConstant = (name: string) => {
    if (userConstants[name] !== undefined) {
      saveToUndo();
      setCurrentValue(userConstants[name].toString());
      setWaitingForNewValue(true);
      lightHaptic();
    }
  };

  const formatValue = (val: string) => {
    if (val === 'Error') return val;
    const parts = val.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const expressionText = () => {
    if (expressionMode) return expression;
    if (operator && previousValue) {
      return `${formatValue(previousValue)} ${operator} ${!waitingForNewValue ? formatValue(currentValue) : ''}`;
    }
    return '';
  };

  // Theme colors
  const theme = {
    background: isDarkTheme ? '#000000' : '#FFFFFF',
    buttonDark: isDarkTheme ? '#333333' : '#E0E0E0',
    buttonAccent: '#ff9500',
    textDark: isDarkTheme ? '#FFFFFF' : '#000000',
    textAccent: '#FFFFFF',
    headerIconBg: isDarkTheme ? '#1C1C1E' : '#F2F2F2',
    iconColor: isDarkTheme ? '#888' : '#555',
    displayText: isDarkTheme ? '#FFFFFF' : '#000000',
    expressionText: isDarkTheme ? '#888888' : '#666666',
    modalBg: isDarkTheme ? '#1C1C1E' : '#F9F9F9',
    modalBorder: isDarkTheme ? '#333' : '#DDD',
  };

  const renderButton = (content: any, type: 'dark' | 'accent', onPress: () => void, customStyle?: StyleProp<ViewStyle>) => {
    const isText = typeof content === 'string';
    const buttonStyles: StyleProp<ViewStyle>[] = [
      styles.button,
      { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
      customStyle,
    ];
    const textStyles: StyleProp<TextStyle>[] = [styles.text];

    if (type === 'accent') {
      buttonStyles.push({ backgroundColor: theme.buttonAccent });
      textStyles.push({ color: theme.textAccent });
    } else {
      buttonStyles.push({ backgroundColor: theme.buttonDark });
      textStyles.push({ color: theme.textDark });
    }

    if (type === 'accent' && operator === content && waitingForNewValue && !expressionMode) {
      buttonStyles.push({ backgroundColor: '#ffffff' });
      textStyles.push({ color: '#ff9500' });
    }

    // Font sizing
    if (isText && ['+', '−', '×', '÷', '=', '^'].includes(content)) {
      textStyles.push({ fontSize: 42, paddingBottom: 4 });
    } else if (isText && ['+/-', 'MC', 'M+', 'M-', 'MR', 'mod', '10ˣ'].includes(content)) {
      textStyles.push({ fontSize: 22 });
    } else if (isText && ['sin', 'cos', 'tan', 'log', 'ln', '√', 'x²', '1/x', 'x!', 'π', 'e', '∛'].includes(content)) {
      textStyles.push({ fontSize: 24 });
    }

    return (
      <TouchableOpacity style={buttonStyles} onPress={onPress} activeOpacity={0.7}>
        {isText ? <Text style={textStyles}>{content}</Text> : content}
      </TouchableOpacity>
    );
  };

  // Modals
  const HistoryModal = () => (
    <Modal visible={historyVisible} animationType="slide" transparent={false}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.modalContainer, { backgroundColor: theme.modalBg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.modalBorder }]}>
          <Text style={[styles.modalTitle, { color: theme.textDark }]}>History</Text>
          <View style={styles.modalHeaderButtons}>
            <TouchableOpacity onPress={exportHistory}>
              <Text style={[styles.modalHeaderButtonText, { color: theme.buttonAccent }]}>Export</Text>
            </TouchableOpacity>
            {history.length > 0 && (
              <TouchableOpacity onPress={clearHistory}>
                <Text style={[styles.modalHeaderButtonText, { color: 'red' }]}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setHistoryVisible(false)} style={styles.modalHeaderButton}>
              <Feather name="x" size={24} color={theme.textDark} />
            </TouchableOpacity>
          </View>
        </View>
        {history.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={[styles.emptyHistoryText, { color: theme.iconColor }]}>No calculations yet</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.historyItem, { borderBottomColor: theme.modalBorder }]}
                onPress={() => loadHistoryItem(item)}>
                <Text style={[styles.historyExpression, { color: theme.iconColor }]}>{item.expression}</Text>
                <Text style={[styles.historyResult, { color: theme.textDark }]}>= {item.result}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.historyList}
          />
        )}
      </SafeAreaView>
    </Modal>
  );

  const ConstantModal = () => (
    <Modal visible={constantModalVisible} animationType="fade" transparent>
      <View style={styles.constantModalOverlay}>
        <View style={[styles.constantModalContent, { backgroundColor: theme.modalBg }]}>
          <Text style={[styles.constantModalTitle, { color: theme.textDark }]}>Save Current Value</Text>
          <Text style={[styles.constantModalValue, { color: theme.textDark }]}>{formatValue(currentValue)}</Text>
          <Text style={[styles.constantModalLabel, { color: theme.iconColor }]}>Constant Name:</Text>
          <TextInput
            style={[styles.constantModalInput, { color: theme.textDark, borderColor: theme.modalBorder }]}
            value={constantName}
            onChangeText={setConstantName}
            placeholder="e.g., myConst"
            placeholderTextColor={theme.iconColor}
            autoCapitalize="none"
          />
          <View style={styles.constantModalButtons}>
            <TouchableOpacity onPress={() => setConstantModalVisible(false)} style={styles.constantModalButton}>
              <Text style={{ color: 'red' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveConstant} style={styles.constantModalButton}>
              <Text style={{ color: theme.buttonAccent }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={isDarkTheme ? 'light' : 'dark'} />

      {/* Header Icons */}
      <View style={[styles.headerIcons, { paddingTop: insets.top || 10 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.headerIconBg }]} onPress={() => setHistoryVisible(true)}>
            <Ionicons name="list-outline" size={24} color={theme.iconColor} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.headerIconBg }]} onPress={() => setConstantModalVisible(true)}>
            <Feather name="save" size={22} color={theme.iconColor} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.headerIconBg }]} onPress={() => setShowScientific(!showScientific)}>
            <Ionicons name="options-outline" size={24} color={theme.iconColor} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: theme.headerIconBg }]} onPress={() => setIsDarkTheme(!isDarkTheme)}>
            <Ionicons name={isDarkTheme ? 'sunny-outline' : 'moon-outline'} size={24} color={theme.iconColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Display Area with swipe for undo/redo */}
      <View style={styles.displayContainer} {...panResponder.panHandlers}>
        <Text style={[styles.expressionText, { color: theme.expressionText }]} numberOfLines={1} adjustsFontSizeToFit>
          {expressionText()}
        </Text>
        <Text style={[styles.displayText, { color: theme.displayText }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatValue(currentValue)}
        </Text>
        <View style={styles.swipeHint}>
          <Text style={[styles.swipeHintText, { color: theme.iconColor }]}>← swipe → (undo/redo)</Text>
        </View>
      </View>

      {/* Buttons Area */}
      <ScrollView style={styles.buttonsScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.buttonsContainer}>
          {/* User Constants Row */}
          {Object.keys(userConstants).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.constantsRow}>
              {Object.entries(userConstants).map(([name, value]) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.constantChip, { backgroundColor: theme.buttonDark }]}
                  onPress={() => recallConstant(name)}>
                  <Text style={[styles.constantChipText, { color: theme.textDark }]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Memory Row */}
          <View style={styles.row}>
            {renderButton('MC', 'dark', handleMemoryClear)}
            {renderButton('M+', 'dark', handleMemoryAdd)}
            {renderButton('M-', 'dark', handleMemorySubtract)}
            {renderButton('MR', 'dark', handleMemoryRecall)}
          </View>

          {/* Scientific Panel */}
          {showScientific && (
            <>
              <View style={styles.row}>
                {renderButton('sin', 'dark', handleSin)}
                {renderButton('cos', 'dark', handleCos)}
                {renderButton('tan', 'dark', handleTan)}
                {renderButton('log', 'dark', handleLog)}
              </View>
              <View style={styles.row}>
                {renderButton('ln', 'dark', handleLn)}
                {renderButton('√', 'dark', handleSqrt)}
                {renderButton('x²', 'dark', handleSquare)}
                {renderButton('1/x', 'dark', handleReciprocal)}
              </View>
              <View style={styles.row}>
                {renderButton('x!', 'dark', handleFactorial)}
                {renderButton('π', 'dark', handlePi)}
                {renderButton('e', 'dark', handleE)}
                {renderButton('^', 'dark', handleExponent)}
              </View>
              <View style={styles.row}>
                {renderButton('∛', 'dark', handleCubeRoot)}
                {renderButton('10ˣ', 'dark', handlePowerOfTen)}
                {renderButton('mod', 'dark', handleModulo)}
                {renderButton('( )', 'dark', handleParentheses)}
              </View>
            </>
          )}

          {/* Standard rows */}
          <View style={styles.row}>
            {renderButton(<Feather name="delete" size={30} color={theme.textDark} />, 'dark', handleBackspace)}
            {renderButton(expressionMode || currentValue === '0' ? 'AC' : 'C', 'dark', handleClear)}
            {renderButton('%', 'dark', handlePercentage)}
            {renderButton('÷', 'accent', () => handleOperator('÷'))}
          </View>
          <View style={styles.row}>
            {renderButton('7', 'dark', () => handleNumber(7))}
            {renderButton('8', 'dark', () => handleNumber(8))}
            {renderButton('9', 'dark', () => handleNumber(9))}
            {renderButton('×', 'accent', () => handleOperator('×'))}
          </View>
          <View style={styles.row}>
            {renderButton('4', 'dark', () => handleNumber(4))}
            {renderButton('5', 'dark', () => handleNumber(5))}
            {renderButton('6', 'dark', () => handleNumber(6))}
            {renderButton('−', 'accent', () => handleOperator('−'))}
          </View>
          <View style={styles.row}>
            {renderButton('1', 'dark', () => handleNumber(1))}
            {renderButton('2', 'dark', () => handleNumber(2))}
            {renderButton('3', 'dark', () => handleNumber(3))}
            {renderButton('+', 'accent', () => handleOperator('+'))}
          </View>
          <View style={styles.row}>
            {renderButton('+/-', 'dark', handlePosNeg)}
            {renderButton('0', 'dark', () => handleNumber(0))}
            {renderButton('.', 'dark', handleDecimal)}
            {renderButton('=', 'accent', handleEqual)}
          </View>
        </View>
      </ScrollView>

      <HistoryModal />
      <ConstantModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  headerIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', gap: 12 },
  headerRight: { flexDirection: 'row', gap: 12 },
  iconButton: { padding: 10, borderRadius: 20 },
  displayContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end', paddingRight: 25, paddingLeft: 25, paddingBottom: 10 },
  expressionText: { fontSize: 30, fontWeight: '400', marginBottom: 5 },
  displayText: { fontSize: 90, fontWeight: '300' },
  swipeHint: { marginTop: 8, alignItems: 'center' },
  swipeHintText: { fontSize: 12, opacity: 0.6 },
  buttonsScrollView: { flexGrow: 0 },
  buttonsContainer: { paddingBottom: 20, paddingHorizontal: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  button: { justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 34, fontWeight: '400' },
  constantsRow: { flexDirection: 'row', marginBottom: 12, paddingHorizontal: 4 },
  constantChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  constantChipText: { fontSize: 14, fontWeight: '500' },
  // Modal styles
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 15, borderBottomWidth: 1 },
  modalTitle: { fontSize: 24, fontWeight: '600' },
  modalHeaderButtons: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  modalHeaderButton: { padding: 8 },
  modalHeaderButtonText: { fontSize: 16, fontWeight: '500' },
  historyList: { paddingHorizontal: 20, paddingVertical: 10 },
  historyItem: { paddingVertical: 14, borderBottomWidth: 1 },
  historyExpression: { fontSize: 18, marginBottom: 4 },
  historyResult: { fontSize: 22, fontWeight: '500' },
  emptyHistory: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyHistoryText: { fontSize: 18 },
  // Constant modal
  constantModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  constantModalContent: { width: '80%', borderRadius: 20, padding: 20, alignItems: 'center' },
  constantModalTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  constantModalValue: { fontSize: 28, fontWeight: '300', marginBottom: 16 },
  constantModalLabel: { fontSize: 14, marginBottom: 8, alignSelf: 'flex-start' },
  constantModalInput: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 20 },
  constantModalButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  constantModalButton: { padding: 12, minWidth: 80, alignItems: 'center' },
});

// Need to import TextInput
import { TextInput } from 'react-native';