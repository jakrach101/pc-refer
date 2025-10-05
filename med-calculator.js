/* Medication Duration Calculator - Smart Quantity Calculator
 * ระบบคำนวณจำนวนยาอัตโนมัติตามจำนวนวันที่ต้องการ
 */

(function() {
  'use strict';

  // Frequency pattern matching for Thai medical system
  const FREQUENCY_PATTERNS = {
    'q24h': { times: 1, label: 'วันละ 1 ครั้ง' },
    'qd': { times: 1, label: 'วันละ 1 ครั้ง' },
    'qHS': { times: 1, label: 'ก่อนนอน 1 ครั้ง' },
    'q12h': { times: 2, label: 'วันละ 2 ครั้ง' },
    'bid': { times: 2, label: 'วันละ 2 ครั้ง' },
    'q8h': { times: 3, label: 'วันละ 3 ครั้ง' },
    'tid': { times: 3, label: 'วันละ 3 ครั้ง' },
    'q6h': { times: 4, label: 'วันละ 4 ครั้ง' },
    'qid': { times: 4, label: 'วันละ 4 ครั้ง' },
    'q4h': { times: 6, label: 'วันละ 6 ครั้ง' },
  };

  // Parse frequency from text
  function parseFrequency(freqText) {
    if (!freqText) return null;

    const text = freqText.toLowerCase().trim();

    // Check exact matches first
    for (const [pattern, info] of Object.entries(FREQUENCY_PATTERNS)) {
      if (text.includes(pattern.toLowerCase())) {
        return info;
      }
    }

    // Try to extract qXh pattern
    const qMatch = text.match(/q\s*(\d+)\s*h/i);
    if (qMatch) {
      const hours = parseInt(qMatch[1]);
      if (hours > 0 && hours <= 24) {
        const times = Math.floor(24 / hours);
        return { times, label: `วันละ ${times} ครั้ง (ทุก ${hours} ชม.)` };
      }
    }

    return null;
  }

  // Calculate medication quantity
  function calculateMedQuantity(dose, frequency, days) {
    const doseNum = parseFloat(dose);
    const daysNum = parseInt(days);

    if (!doseNum || !daysNum || daysNum <= 0) {
      return null;
    }

    const freqInfo = parseFrequency(frequency);
    if (!freqInfo) {
      return {
        error: 'ไม่สามารถระบุความถี่ได้ กรุณาระบุความถี่ (เช่น q12h, bid, tid)'
      };
    }

    // Calculate total quantity
    const perDay = doseNum * freqInfo.times;
    const total = perDay * daysNum;

    // Add safety margin (10% extra, rounded up)
    const safetyMargin = Math.ceil(total * 0.1);
    const totalWithMargin = total + safetyMargin;

    return {
      quantity: Math.ceil(totalWithMargin),
      quantityExact: total,
      safetyMargin,
      perDay,
      freqInfo,
      calculation: {
        dose: doseNum,
        timesPerDay: freqInfo.times,
        days: daysNum
      }
    };
  }

  // Format result display
  function formatCalculationDetail(result) {
    if (!result || result.error) return '';

    const { dose, timesPerDay, days } = result.calculation;
    return `${dose} × ${timesPerDay} ครั้ง/วัน × ${days} วัน = ${result.quantityExact.toFixed(1)} (+ ${result.safetyMargin} สำรอง)`;
  }

  // Initialize calculator
  function initMedCalculator() {
    const durationInput = document.getElementById('medDuration');
    const calcBtn = document.getElementById('calcMedQty');
    const applyBtn = document.getElementById('applyCalcResult');
    const qtyInput = document.getElementById('qty');
    const freqInput = document.getElementById('freq');
    const doseInput = document.getElementById('dose');

    // New UI elements
    const showCalcBtn = document.getElementById('showCalc');
    const closeCalcBtn = document.getElementById('closeCalc');
    const calcPanel = document.getElementById('calcPanel');
    const calcDoseInput = document.getElementById('calcDoseInput');
    const calcFreqInput = document.getElementById('calcFreqInput');
    const calcResultRow = document.getElementById('calcResultRow');
    const calcResultValue = document.getElementById('calcResultValue');

    if (!calcBtn) return; // Exit if elements not found

    let lastCalculation = null;

    // Show calculator panel
    if (showCalcBtn && calcPanel) {
      showCalcBtn.addEventListener('click', function(e) {
        e.preventDefault();

        // Copy current values to calculator inputs
        if (calcDoseInput) calcDoseInput.value = doseInput.value || '';
        if (calcFreqInput) calcFreqInput.value = freqInput.value || '';

        calcPanel.classList.remove('hidden');

        // Focus on duration input
        if (durationInput) {
          setTimeout(() => durationInput.focus(), 100);
        }
      });
    }

    // Close calculator panel
    if (closeCalcBtn && calcPanel) {
      closeCalcBtn.addEventListener('click', function() {
        calcPanel.classList.add('hidden');
        if (calcResultRow) calcResultRow.classList.add('hidden');
        if (durationInput) durationInput.value = '';
        if (calcDoseInput) calcDoseInput.value = '';
        if (calcFreqInput) calcFreqInput.value = '';
      });
    }

    // ESC key to close calculator panel
    if (calcPanel) {
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !calcPanel.classList.contains('hidden')) {
          calcPanel.classList.add('hidden');
          if (calcResultRow) calcResultRow.classList.add('hidden');
          if (durationInput) durationInput.value = '';
          if (calcDoseInput) calcDoseInput.value = '';
          if (calcFreqInput) calcFreqInput.value = '';
        }
      });
    }

    // Hide result when calculator inputs change
    [calcDoseInput, calcFreqInput, durationInput].forEach(input => {
      if (input) {
        input.addEventListener('input', function() {
          if (calcResultRow) calcResultRow.classList.add('hidden');
          lastCalculation = null;
        });
      }
    });

    // Calculate button click
    calcBtn.addEventListener('click', function() {
      const days = durationInput.value;
      const dose = calcDoseInput.value;
      const frequency = calcFreqInput.value;

      // Validation
      if (!days || days <= 0) {
        showSnack('กรุณาระบุจำนวนวันที่ต้องการ', 'warn');
        durationInput.focus();
        return;
      }

      if (!dose || dose <= 0) {
        showSnack('กรุณาระบุจำนวนต่อครั้งก่อน', 'warn');
        calcDoseInput.focus();
        return;
      }

      if (!frequency) {
        showSnack('กรุณาระบุวิธีใช้ยาก่อน (เช่น q12h, tid)', 'warn');
        calcFreqInput.focus();
        return;
      }

      // Calculate
      const result = calculateMedQuantity(dose, frequency, days);

      if (result.error) {
        showSnack(result.error, 'warn');
        if (resultCompact) resultCompact.classList.add('hidden');
        if (applyBtn) applyBtn.classList.add('hidden');
        return;
      }

      // Show result in new UI
      lastCalculation = result;
      const drugInfo = getDrugInfo();
      const unit = drugInfo.unit;

      // Calculate pack quantity if applicable
      let displayText = `${result.quantity} ${unit}`;
      if (drugInfo.packSize && drugInfo.packUnit) {
        const numPacks = calculatePackQuantity(result.quantity, drugInfo.packSize);
        displayText += ` = ${numPacks} ${drugInfo.packUnit}`;
      }
      displayText += ` (${dose} × ${result.freqInfo.times} ครั้ง/วัน × ${days} วัน)`;

      if (calcResultValue) {
        calcResultValue.textContent = displayText;
      }
      if (calcResultRow) calcResultRow.classList.remove('hidden');
      if (applyBtn) applyBtn.classList.remove('hidden');

      showSnack('คำนวณสำเร็จ! 🎉', 'ok');
    });

    // Apply calculation result
    if (applyBtn) {
      applyBtn.addEventListener('click', function() {
        if (lastCalculation) {
          qtyInput.value = lastCalculation.quantity;
          qtyInput.classList.add('success');
          qtyInput.removeAttribute('readonly');

          // Remove success class after animation
          setTimeout(() => {
            qtyInput.classList.remove('success');
          }, 2000);

          showSnack(`✓ ใส่จำนวน ${lastCalculation.quantity} แล้ว`, 'ok');

          // Close calculator panel
          if (calcPanel) calcPanel.classList.add('hidden');
          if (calcResultRow) calcResultRow.classList.add('hidden');
          if (applyBtn) applyBtn.classList.add('hidden');
          if (durationInput) durationInput.value = '';
          if (calcDoseInput) calcDoseInput.value = '';
          if (calcFreqInput) calcFreqInput.value = '';

          lastCalculation = null;
        }
      });
    }

    // Enter key to calculate
    [calcDoseInput, calcFreqInput, durationInput].forEach(input => {
      if (input) {
        input.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            calcBtn.click();
          }
        });
      }
    });
  }

  // Helper: Get unit and pack info from drug name via FORMULARY
  function getDrugInfo() {
    const drugName = document.getElementById('drugName')?.value || '';

    // Try to find in FORMULARY first (defined in app.js)
    if (typeof FORMULARY !== 'undefined') {
      const match = FORMULARY.find(f =>
        f.name.toLowerCase() === drugName.toLowerCase().trim()
      );

      if (match) {
        return {
          unit: match.unit || 'หน่วย',
          packSize: match.packSize,
          packUnit: match.packUnit
        };
      }
    }

    // Fallback: infer from drug name
    let unit = 'หน่วย';
    if (/tab/i.test(drugName)) unit = 'tab';
    else if (/cap/i.test(drugName)) unit = 'cap';
    else if (/patch/i.test(drugName)) unit = 'patch';
    else if (/amp/i.test(drugName)) unit = 'amp';
    else if (/mL|ml/i.test(drugName)) unit = 'mL';

    return { unit, packSize: null, packUnit: null };
  }

  // Calculate number of packs needed
  function calculatePackQuantity(totalUnits, packSize) {
    if (!packSize || packSize <= 0) return null;
    return Math.ceil(totalUnits / packSize);
  }

  // Helper: Show snackbar notification
  function showSnack(message, type = 'info') {
    if (typeof snack === 'function') {
      snack(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMedCalculator);
  } else {
    initMedCalculator();
  }

  // Expose for external use
  window.MedCalculator = {
    calculate: calculateMedQuantity,
    parseFrequency
  };

})();
