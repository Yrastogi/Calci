import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, useWindowDimensions, StyleProp, ViewStyle, TextStyle, PanResponder, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather } from '@expo/vector-icons';

export default function Calculator() {
  const [currentValue, setCurrentValue] = useState<string>('0');
  const [operator, setOperator] = useState<string | null>(null);
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState<boolean>(false);

  const { width } = useWindowDimensions();
  // Slightly smaller circular buttons to allow for generous spacing
  const buttonSize = width / 4 - 20;

  const handleBackspace = () => {
    setCurrentValue((prev) => {
      if (prev === 'Error' || prev.length === 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        if (Math.abs(gestureState.dx) > 30) {
          handleBackspace();
        }
      },
    })
  ).current;

  const handleNumber = (num: number | string) => {
    if (waitingForNewValue) {
      setCurrentValue(num.toString());
      setWaitingForNewValue(false);
    } else {
      if (currentValue === 'Error') {
        setCurrentValue(num.toString());
      } else {
        const valueWithoutCommas = currentValue.replace(/,/g, '');
        if (valueWithoutCommas.replace('.', '').replace('-', '').length >= 9) return;
        setCurrentValue(currentValue === '0' ? num.toString() : currentValue + num.toString());
      }
    }
  };

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
      default:
        return current.toString();
    }
    
    return parseFloat(result.toPrecision(10)).toString();
  };

  const handleOperator = (op: string) => {
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
    if (!operator) return;
    const result = calculate(previousValue, currentValue, operator);
    setCurrentValue(result);
    setPreviousValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
  };

  const handleClear = () => {
    if (currentValue !== '0') {
      setCurrentValue('0');
    } else {
      setOperator(null);
      setPreviousValue(null);
      setWaitingForNewValue(false);
    }
  };

  const handlePosNeg = () => {
    if (currentValue === 'Error') return;
    setCurrentValue((parseFloat(currentValue) * -1).toString());
  };

  const handlePercentage = () => {
    if (currentValue === 'Error') return;
    setCurrentValue((parseFloat(currentValue) / 100).toString());
  };

  const handleDecimal = () => {
    if (waitingForNewValue) {
      setCurrentValue('0.');
      setWaitingForNewValue(false);
    } else if (!currentValue.includes('.')) {
      setCurrentValue(currentValue + '.');
    }
  };

  const formatValue = (val: string) => {
    if (val === 'Error') return val;
    const parts = val.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  // Helper component to render buttons
  const renderButton = (content: any, type: 'dark' | 'accent', onPress: () => void) => {
    const isText = typeof content === 'string';
    
    const buttonStyles: StyleProp<ViewStyle>[] = [
      styles.button,
      { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 }
    ];
    
    const textStyles: StyleProp<TextStyle>[] = [styles.text];

    if (type === 'accent') {
      buttonStyles.push(styles.buttonAccent);
      textStyles.push(styles.textAccent);
    } else {
      buttonStyles.push(styles.buttonDark);
      textStyles.push(styles.textDark);
    }

    if (type === 'accent' && operator === content && waitingForNewValue) {
       buttonStyles.push({ backgroundColor: '#ffffff' });
       textStyles.push({ color: '#ff9500' });
    }

    // Special font sizing for larger characters like operators
    if (isText && ['+', '−', '×', '÷', '='].includes(content)) {
       textStyles.push({ fontSize: 42, paddingBottom: 4 });
    } else if (isText && content === '+/-') {
       textStyles.push({ fontSize: 28 });
    }

    return (
      <TouchableOpacity style={buttonStyles} onPress={onPress} activeOpacity={0.7}>
        {isText ? (
          <Text style={textStyles}>{content}</Text>
        ) : (
          content
        )}
      </TouchableOpacity>
    );
  };

  // Format the expression string above the main display
  const expressionText = operator && previousValue 
    ? `${formatValue(previousValue)}${operator}${!waitingForNewValue ? formatValue(currentValue) : ''}`
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Top Header Icons */}
      <View style={styles.headerIcons}>
        <TouchableOpacity style={styles.iconButton}>
          <Feather name="clock" size={24} color="#888" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons name="calculator-outline" size={24} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.displayContainer} {...panResponder.panHandlers}>
        <Text style={styles.expressionText} numberOfLines={1} adjustsFontSizeToFit>
          {expressionText}
        </Text>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {formatValue(currentValue)}
        </Text>
      </View>

      <View style={styles.buttonsContainer}>
        <View style={styles.row}>
          {renderButton(<Feather name="delete" size={30} color="#ffffff" />, 'dark', handleBackspace)}
          {renderButton(currentValue === '0' ? 'AC' : 'C', 'dark', handleClear)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
  },
  headerIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
    position: 'absolute',
    top: 50, // Avoid edge notches
    zIndex: 10,
  },
  iconButton: {
    padding: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
  },
  displayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: 25,
    paddingLeft: 25,
    paddingBottom: 20,
  },
  expressionText: {
    color: '#888888',
    fontSize: 30,
    fontWeight: '400',
    marginBottom: 5,
  },
  displayText: {
    color: '#ffffff',
    fontSize: 90,
    fontWeight: '300',
  },
  buttonsContainer: {
    paddingBottom: 35, // Adjust for bottom area
    paddingHorizontal: 15,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDark: {
    backgroundColor: '#333333',
  },
  buttonAccent: {
    backgroundColor: '#ff9500',
  },
  text: {
    fontSize: 34,
    fontWeight: '400',
  },
  textDark: {
    color: '#ffffff',
  },
  textAccent: {
    color: '#ffffff',
  },
});
