let symptoms = [];
const commonSymptoms = [
    'Pyloric atresia', 'Retinopathy', 'Rippling muscles', 'Hyperreflexia', 'Polyhill sign', 'Hypogonadism ', 'Muscle weakness', 'Progressive muscle degeneration', 'Elevated creatinine phosphokinase',
    'Scoliosis', 'Joint contractures', 'Cardiac abnormalities', 'Respiratory failure', 'Developmental delay'
];

let symptomConditionDf = null;
let allSymptoms = [];
let symptomMapping = {};
let conditionUrls = {};
let uploadedItems = [];

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Create uploadPreview element if it doesn't exist
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('uploadPreview')) {
    console.warn('uploadPreview element not found, creating it dynamically...');
    
    // Find the file input
    const fileInput = document.getElementById('imageUpload');
    if (fileInput) {
      // Create the preview container
      const previewDiv = document.createElement('div');
      previewDiv.id = 'uploadPreview';
      previewDiv.style.cssText = 'margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; min-height: 50px;';
      previewDiv.innerHTML = '<p style="color: #888;">No files uploaded</p>';
      
      // Insert after the file input
      fileInput.parentNode.insertBefore(previewDiv, fileInput.nextSibling);
      console.log('uploadPreview element created successfully');
    }
  }
});
// Function to compute LCS length
function lcsLength(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return dp[m][n];
}

// SequenceMatcher-like ratio
function sequenceMatcherRatio(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    if (s1.length === 0 && s2.length === 0) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const lcs = lcsLength(s1, s2);
    return 2.0 * lcs / (s1.length + s2.length);
}

// Extract symptom name
function extractSymptomName(fullSymptomText) {
    if (fullSymptomText.includes('(') && fullSymptomText.includes(')')) {
        return fullSymptomText.split('(')[0].trim();
    }
    return fullSymptomText.trim();
}

// Find closest matches
function findClosestMatches(inputSymptom, allSymptoms, threshold = 0.6) {
    const matches = [];
    for (const fullSymptom of allSymptoms) {
        const simpleSymptom = extractSymptomName(fullSymptom);
        const similarity = sequenceMatcherRatio(inputSymptom, simpleSymptom);
        if (similarity >= threshold) {
            matches.push({ full: fullSymptom, simple: simpleSymptom, similarity: Math.round(similarity * 100) / 100 });
        }
    }
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches;
}

// Prioritize conditions
function prioritizeConditions(symptomsList, symptomConditionDf, symptomMapping) {
    const mappedSymptoms = symptomsList.map(s => symptomMapping[s.toLowerCase()] || s);

    const symptomIndices = mappedSymptoms.map(ms => symptomConditionDf.symptoms.indexOf(ms)).filter(idx => idx !== -1);
    if (symptomIndices.length === 0) return { scores: {}, matched: {} };

    const filteredData = symptomIndices.map(idx => symptomConditionDf.data[idx]);

    const conditionScores = {};
    symptomConditionDf.conditions.forEach((condition, colIdx) => {
        let score = 0;
        filteredData.forEach(row => score += row[colIdx] || 0);
        conditionScores[condition] = score;
    });

    const sortedScores = Object.entries(conditionScores)
        .filter(([, score]) => score > 0)
        .sort(([, a], [, b]) => b - a);

    const prioritizedConditions = {};
    for (const [condition, score] of sortedScores) {
        prioritizedConditions[condition] = score;
    }

    const matchedSymptomsDict = {};
    for (const condition of symptomConditionDf.conditions) {
        const matchedFull = [];
        const colIdx = symptomConditionDf.conditions.indexOf(condition);
        for (let rowIdx = 0; rowIdx < symptomIndices.length; rowIdx++) {
            const dataIdx = symptomIndices[rowIdx];
            if (symptomConditionDf.data[dataIdx][colIdx] === 1) {
                const fullSymptom = symptomConditionDf.symptoms[dataIdx];
                const simple = extractSymptomName(fullSymptom);
                matchedFull.push(simple);
            }
        }
        matchedSymptomsDict[condition] = matchedFull;
    }

    return { scores: prioritizedConditions, matched: matchedSymptomsDict };
}

// Load and preprocess data from JSON
async function loadData() {
    try {
        const response = await fetch('prevalence.json');
        if (!response.ok) throw new Error('Failed to fetch prevalence.json');
        const json = await response.json();

        symptomConditionDf = json;
        allSymptoms = json.symptoms;
        symptomMapping = {};
        for (const full of allSymptoms) {
            const simple = extractSymptomName(full);
            const key = simple.toLowerCase();
            if (!symptomMapping.hasOwnProperty(key)) symptomMapping[key] = full;
        }

        const urlResponse = await fetch('conditions_gene_data.json');
        if (urlResponse.ok) conditionUrls = await urlResponse.json();
        else console.warn('condition_urls.json not found or failed to load');

        console.log('Data loaded successfully');
        return true;
    } catch (e) {
        console.error(`Error loading file: ${e}`);
        return false;
    }
}

// Fetch all possible symptoms for autocomplete
async function fetchAllSymptoms() {
    if (!symptomConditionDf) { console.error('Data not loaded'); return; }
    const simpleSymptoms = allSymptoms.map(extractSymptomName);
    const uniqueSorted = [...new Set(simpleSymptoms)].sort();
    const datalist = document.getElementById('symptomSuggestions');
    uniqueSorted.forEach(sym => {
        const option = document.createElement('option');
        option.value = sym;
        datalist.appendChild(option);
    });
}

// DOM elements
const input = document.getElementById('symptomInput');
const addBtn = document.getElementById('addBtn');
const addedList = document.getElementById('addedSymptoms');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsDiv = document.getElementById('results');
const clearBtn = document.getElementById('clearSymptoms');
const fileInput = document.getElementById("imageUpload");
const previewContainer = document.getElementById("uploadPreview");

if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    
    console.log("Files selected:", files.length);

    for (const file of files) {
      console.log("Processing file:", file.name, file.type);
      if (file.type.startsWith("image/")) {
        handleImageFile(file);
      } else if (file.type === "application/pdf") {
        await handlePdfFile(file);
      }
    }

    console.log("After processing, uploadedItems:", uploadedItems);
    fileInput.value = "";
  });
}

// Add symptom
addBtn.addEventListener('click', addSymptom);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymptom(); });
function addSymptom() {
    const symptom = input.value.trim();
    if (symptom && !symptoms.includes(symptom)) {
        symptoms.push(symptom);
        updateAddedList();
        input.value = '';
        updateAnalyzeBtn();
        const newItem = addedList.lastChild;
        newItem.style.animation = 'fadeIn 0.5s';
    }
}

// Quick add common symptoms
document.querySelectorAll('.common-symptoms button').forEach(btn => {
    btn.addEventListener('click', () => {
        const symptom = btn.dataset.symptom;
        if (!symptoms.includes(symptom)) {
            symptoms.push(symptom);
            updateAddedList();
            updateAnalyzeBtn();
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    });
});

function updateAddedList() {
    addedList.innerHTML = symptoms.map((symptom, index) => 
        `<div class="symptom-item">
            <span>${symptom}</span>
            <button type="button" onclick="removeSymptom(${index})"><i class="fas fa-times"></i></button>
        </div>`).join('');
    clearBtn.style.display = symptoms.length > 0 ? 'block' : 'none';
}

function removeSymptom(index) {
    const symptom = symptoms[index];
    symptoms.splice(index, 1);
    updateAddedList();
    updateAnalyzeBtn();
    document.querySelectorAll('.common-symptoms button').forEach(btn => {
        if (btn.dataset.symptom === symptom) { btn.disabled = false; btn.style.opacity = '1'; }
    });
}

// Clear all symptoms
clearBtn.addEventListener('click', () => {
    symptoms = [];
    updateAddedList();
    updateAnalyzeBtn();
    document.querySelectorAll('.common-symptoms button').forEach(btn => {
        btn.disabled = false; btn.style.opacity = '1';
    });
});

function updateAnalyzeBtn() { analyzeBtn.disabled = symptoms.length === 0; }

// Analyze button
analyzeBtn.addEventListener('click', async () => {
    if (!symptomConditionDf) {
        resultsDiv.innerHTML = `<div class="error"><p>Error: Data not loaded. Please refresh the page.</p></div>`;
        return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    resultsDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Analyzing symptoms...</p>';

    try {
        const valid_symptoms = [];
        const invalid_symptoms = [];
        const suggested_matches = {};

        for (const symptom of symptoms) {
            const originalSimple = extractSymptomName(symptom);
            const lowerSimple = originalSimple.toLowerCase();
            if (symptomMapping.hasOwnProperty(lowerSimple)) valid_symptoms.push(originalSimple);
            else {
                invalid_symptoms.push(symptom);
                const closeMatches = findClosestMatches(symptom, allSymptoms);
                if (closeMatches.length > 0) suggested_matches[symptom] = closeMatches.slice(0, 3);
            }
        }

        let prioritized_conditions = {};
        let matched_symptoms = {};
        let top_condition = "";

        if (valid_symptoms.length > 0) {
            const { scores, matched } = prioritizeConditions(valid_symptoms, symptomConditionDf, symptomMapping);
            prioritized_conditions = scores;
            matched_symptoms = matched;
            top_condition = Object.keys(scores)[0] || "";
        }
        
        // Store step 2 results for PDF
        localStorage.setItem("step2TopCondition", top_condition || "N/A");

        const step2Matched = [];
        if (top_condition && matched_symptoms[top_condition]) {
            matched_symptoms[top_condition].forEach(sym => {
                const full = symptomConditionDf.symptoms.find(s =>
                    s.toLowerCase().includes(sym.toLowerCase())
                );
                const hpoMatch = full?.match(/\(HP:\d+\)/);
                step2Matched.push({
                    symptom: sym,
                    hpo: hpoMatch ? hpoMatch[0].replace(/[()]/g, "") : "N/A"
                });
            });
        }
        localStorage.setItem("step2MatchedSymptoms", JSON.stringify(step2Matched));

        const otherConditions = Object.keys(prioritized_conditions)
            .filter(c => c !== top_condition)
            .slice(0, 5);
        localStorage.setItem("step2OtherConditions", JSON.stringify(otherConditions));

        const data = {
            valid_symptoms,
            invalid_symptoms,
            suggested_matches,
            prioritized_conditions,
            matched_symptoms,
            top_condition
        };

        let html = `<h3>Prioritized conditions (based on ${data.valid_symptoms?.length || 0} symptoms):</h3>`;
        
        if (data.invalid_symptoms && data.invalid_symptoms.length > 0) {
            html += '<div class="warnings"><h4>Warning: The following symptoms were not recognized:</h4>';
            data.invalid_symptoms.forEach(symptom => { html += `<p>- '${symptom}'</p>`; });
            if (data.suggested_matches) {
                Object.entries(data.suggested_matches).forEach(([invalid, matches]) => {
                    html += `<p>Suggested matches for '${invalid}':</p>`;
                    matches.forEach(match => {
                        html += `<p class="suggested-match" data-full="${match.full}" onclick="replaceSymptom('${invalid}', '${match.simple}')">• ${match.simple} (${(match.similarity * 100).toFixed(1)}% match)</p>`;
                    });
                });
            }
            html += '</div>';
        }

        if (data.top_condition) {
            html += `<div class="top-recommendation"><h2>TOP RECOMMENDATION: ${data.top_condition}</h2>`;
            if (conditionUrls[data.top_condition]) {
                html += `<p><a href="${conditionUrls[data.top_condition]}" target="_blank" class="condition-link">Learn more about ${data.top_condition}</a></p>`;
            }
            html += `</div>`;
        }

        // Sunburst chart container
        html += '<div id="sunburstChart" style="width:100%; height:500px; margin-top: 20px;"></div>';

        if (Object.keys(data.prioritized_conditions || {}).length > 1) {
            html += '<div class="other-conditions"><h4>Other potential conditions:</h4>';
            const sortedConditions = Object.entries(data.prioritized_conditions).sort((a, b) => b[1] - a[1]);
            sortedConditions.slice(1, 4).forEach(([condition, score]) => {
                if (score > 0) {
                    html += `<p class="other-condition">- ${condition}: ${score} matching symptoms`;
                    if (conditionUrls[condition]) html += ` (<a href="${conditionUrls[condition]}" target="_blank">More Info</a>)`;
                    html += `</p>`;
                }
            });
            html += '</div>';
        }
        
        html += '<div class="conditions-grid">';
        Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
            const matched = data.matched_symptoms[condition] || [];
            const url = conditionUrls[condition] || null;
            html += `
                <div class="condition-card">
                    <h4>${condition}</h4>
                    <p class="score">Score: ${score} matching symptom(s)</p>
                    <p class="matched">Matched: ${matched.join(', ') || 'None'}</p>
                    ${url ? `<p><a href="${url}" target="_blank" class="condition-link">More Info</a></p>` : ""}
                </div>
            `;
        });
        html += '</div>';

        if (Object.keys(data.prioritized_conditions || {}).length === 0) {
            html += '<p>No conditions match the provided symptoms.</p>';
        }

        resultsDiv.innerHTML = `<div class="results-content">${html}</div>`;
        
        // PDF download button
        setTimeout(() => {
            const pdfBtn = document.getElementById("downloadPdfBtn");
            if (pdfBtn) {
                pdfBtn.style.display = "block";
                pdfBtn.addEventListener('click', generateFinalNMPhenoscorePDF);
                console.log("PDF download button activated");
            } else {
                console.warn("downloadPdfBtn not found");
            }
        }, 100);

        // Sunburst Chart
        let labels = ["Potential Conditions"];
        let parents = [""];
        let values = [0];
        let hovertext = ["Root node with all potential conditions"];
        let colors = ["#f0f0f0"];
        let totalScore = 0;

        Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
            labels.push(condition);
            parents.push("Potential Conditions");
            values.push(score);
            hovertext.push(`Condition: ${condition}<br>Score: ${score}`);
            totalScore += score;
            colors.push(condition === data.top_condition ? "#28a745" : "#d3d3d3");
        });

        if (data.top_condition) {
            const matched = data.matched_symptoms[data.top_condition] || [];
            matched.forEach(sym => {
                labels.push(sym);
                parents.push(data.top_condition);
                values.push(1);
                hovertext.push(`Symptom: ${sym}<br>Contributes to ${data.top_condition}`);
                colors.push("#28a745");
            });
        }

        values[0] = totalScore;

        const chartData = [{
            type: "sunburst",
            labels: labels,
            parents: parents,
            values: values,
            hovertext: hovertext,
            hoverinfo: "text+value+percent parent",
            branchvalues: "total",
            marker: { line: {width: 2}, colors: colors }
        }];

        const layout = { margin: {l: 0, r: 0, b: 0, t: 0}, hovermode: 'closest' };
        Plotly.newPlot('sunburstChart', chartData, layout);

        // HPO extraction & Excel download
        if (data.top_condition) {
            const topCondition = data.top_condition;
            const matchedSymptoms = data.matched_symptoms[topCondition] || [];

            const hpoTerms = symptomConditionDf.symptoms
                .filter(sym => matchedSymptoms.some(ms => sym.toLowerCase().includes(ms.toLowerCase())))
                .map(sym => {
                    const match = sym.match(/\(HP:\d+\)/);
                    const hpo = match ? match[0].replace(/[()]/g, '') : '';
                    return { Symptom: sym.split('(')[0].trim(), HPO_ID: hpo };
                })
                .filter(row => row.HPO_ID !== '');

            if (hpoTerms.length > 0) {
                const hpoHtml = `
                    <div class="hpo-section">
                        <h3>HPO Terms for ${topCondition}:</h3>
                        <table class="hpo-table">
                            <tr><th>Symptom</th><th>HPO ID</th></tr>
                            ${hpoTerms.map(r => `<tr><td>${r.Symptom}</td><td>${r.HPO_ID}</td></tr>`).join('')}
                        </table>
                        <button id="downloadHpoBtn" class="download-btn">📥 Download HPO Excel</button>
                    </div>
                `;
                resultsDiv.querySelector('.results-content').insertAdjacentHTML('beforeend', hpoHtml);

                document.getElementById('downloadHpoBtn').addEventListener('click', () => {
                    const wsData = [["Symptom", "HPO_ID"], ...hpoTerms.map(r => [r.Symptom, r.HPO_ID])];
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(wsData);
                    XLSX.utils.book_append_sheet(wb, ws, "HPO_Terms");
                    XLSX.writeFile(wb, `${topCondition.replace(/\s+/g, '_')}_HPO_Terms.xlsx`);
                });
            }
        }

    } catch (error) {
        resultsDiv.innerHTML = `<div class="error"><p>Error: ${error.message}. Ensure the data files are available.</p></div>`;
    }

    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Analyze Symptoms';
});

// Replace invalid symptom
function replaceSymptom(invalid, simple) {
    const index = symptoms.indexOf(invalid);
    if (index > -1) {
        symptoms[index] = simple;
        updateAddedList();
        if (confirm(`Replaced '${invalid}' with '${simple}'. Re-analyze?`)) analyzeBtn.click();
    }
}

// Handle image file
function handleImageFile(file) {
  const item = {
    id: crypto.randomUUID(),
    type: "image",
    file: file,
    name: file.name,
    status: "ready"
  };
  uploadedItems.push(item);
  console.log("Image added to uploadedItems:", item.name);
  renderFileList();
}

// Handle PDF file with conversion
async function handlePdfFile(file) {
  const item = {
    id: crypto.randomUUID(),
    type: "pdf",
    name: file.name,
    status: "processing",
    images: []
  };
  
  uploadedItems.push(item);
  console.log("PDF item created:", item.name);
  renderFileList();
  
  // Convert PDF to images
  try {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded');
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    
    console.log(`Converting PDF ${file.name} with ${numPages} pages...`);
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      item.images.push({
        pageNum: pageNum,
        dataUrl: dataUrl
      });
      
      console.log(`Converted page ${pageNum}/${numPages} of ${file.name}`);
    }
    
    item.status = "ready";
    console.log(`PDF conversion complete: ${file.name}, ${item.images.length} pages`);
    renderFileList();
    
  } catch (error) {
    console.error("Error converting PDF:", error);
    item.status = "error";
    item.errorMessage = error.message;
    renderFileList();
  }
}

// Render file list with status
function renderFileList() {
  const container = document.getElementById("uploadPreview");
  
  if (!container) {
    console.error("uploadPreview element not found in DOM!");
    console.log("Available elements with 'upload' in ID:", 
      Array.from(document.querySelectorAll('[id*="upload"]')).map(el => el.id));
    return;
  }
  
  container.innerHTML = "";

  if (uploadedItems.length === 0) {
    container.innerHTML = "<p style='color: #888;'>No files uploaded</p>";
    return;
  }

  console.log("Rendering", uploadedItems.length, "items");

  uploadedItems.forEach(item => {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 4px 0; background: #f5f5f5; border-radius: 4px;";

    const name = document.createElement("span");
    name.style.cssText = "flex: 1; font-size: 14px;";
    
    if (item.type === "pdf") {
      if (item.status === "processing") {
        name.textContent = `${item.name} (Processing...)`;
        name.style.color = "#2B8CEE";
      } else if (item.status === "ready") {
        name.textContent = `${item.name} (${item.images.length} pages)`;
        name.style.color = "#22A06B";
      } else if (item.status === "error") {
        name.textContent = `${item.name} (Failed)`;
        name.style.color = "#DC2626";
      }
    } else {
      name.textContent = item.name;
    }

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.style.cssText = "padding: 4px 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;";
    removeBtn.onmouseover = () => removeBtn.style.background = "#b91c1c";
    removeBtn.onmouseout = () => removeBtn.style.background = "#dc2626";
    removeBtn.onclick = () => {
      uploadedItems = uploadedItems.filter(f => f.id !== item.id);
      console.log("Removed item:", item.name, "Remaining items:", uploadedItems.length);
      renderFileList();
    };

    row.appendChild(name);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
  
  console.log("File list rendered. Total items:", uploadedItems.length);
}
// Convert file to data URL
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate final PDF report 
async function generateFinalNMPhenoscorePDF() {
  console.log("=== STARTING PDF GENERATION ===");
  
  if (!window.jspdf) {
    alert("jsPDF not loaded");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  let y = 15;

  // Retrieve patient data
  const patientName = localStorage.getItem("patientName") || "N/A";
  const patientAge = localStorage.getItem("patientAge") || "N/A";
  const patientContact = localStorage.getItem("patientContact") || "N/A";
  const score = localStorage.getItem("step1Score") || "0%";
  const status = localStorage.getItem("step1Status") || "N/A";
  const step1Symptoms = JSON.parse(localStorage.getItem("step1Symptoms") || "[]");
  const topCondition = localStorage.getItem("step2TopCondition") || "N/A";
  const matchedSymptoms = JSON.parse(localStorage.getItem("step2MatchedSymptoms") || "[]");
  const otherConditions = JSON.parse(localStorage.getItem("step2OtherConditions") || "[]");

  // HEADER SECTION
  pdf.setFontSize(20);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text("NMPhenoscore DIAGNOSTIC REPORT", 105, y, { align: "center" });
  y += 8;
  
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(60, 60, 60);
  pdf.text("Neuromuscular Genetic Disorder Assessment", 105, y, { align: "center" });
  y += 12;
  
  pdf.setDrawColor(43, 140, 238);
  pdf.setLineWidth(0.5);
  pdf.line(20, y, 190, y);
  y += 10;

  // PATIENT INFORMATION BOX
  pdf.setFillColor(245, 247, 250);
  pdf.rect(20, y, 170, 32, 'F');
  
  pdf.setFontSize(11);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text("PATIENT INFORMATION", 25, y + 6);
  
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(10);
  y += 12;
  
  pdf.setFont(undefined, 'bold');
  pdf.text("Patient Name:", 25, y);
  pdf.setFont(undefined, 'normal');
  pdf.text(patientName, 60, y);
  
  pdf.setFont(undefined, 'bold');
  pdf.text("Age:", 120, y);
  pdf.setFont(undefined, 'normal');
  pdf.text(`${patientAge} years`, 135, y);
  y += 7;
  
  pdf.setFont(undefined, 'bold');
  pdf.text("Contact:", 25, y);
  pdf.setFont(undefined, 'normal');
  pdf.text(patientContact, 60, y);
  
  pdf.setFont(undefined, 'bold');
  pdf.text("Report Date:", 120, y);
  pdf.setFont(undefined, 'normal');
  pdf.text(new Date().toLocaleDateString('en-GB'), 155, y);
  y += 15;

  // SECTION 1: INITIAL SCREENING
  pdf.setFontSize(13);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(43, 140, 238);
  pdf.text("1. INITIAL SCREENING FOR NMGD", 20, y);
  y += 8;
  
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  
  pdf.setFillColor(245, 245, 245);
  pdf.rect(25, y, 80, 18, 'F');
  pdf.setFont(undefined, 'bold');
  pdf.text("Assessment Result:", 30, y + 6);
  pdf.setFont(undefined, 'normal');
  const resultColor = status.includes('Positive') ? [220, 38, 38] : [34, 197, 94];
  pdf.setTextColor(...resultColor);
  pdf.text(status, 30, y + 13);
  
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.setFillColor(240, 248, 255);
  pdf.rect(110, y, 80, 18, 'F');
  pdf.setFont(undefined, 'bold');
  pdf.text("Assessment Score:", 115, y + 6);
  pdf.setFontSize(14);
  pdf.setTextColor(43, 140, 238);
  pdf.text(score, 115, y + 13);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  y += 25;

  // Clinical presentation
  if (step1Symptoms.length > 0) {
    pdf.setFont(undefined, 'bold');
    pdf.text(`Clinical Presentation (${step1Symptoms.length} symptoms identified):`, 25, y);
    y += 6;
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(9);
    
    const leftColumnX = 30;
    const rightColumnX = 110;
    const columnWidth = 75;
    let leftY = y;
    let rightY = y;
    
    step1Symptoms.forEach((symptom, idx) => {
      if (idx % 2 === 0) {
        if (leftY > 265) { pdf.addPage(); leftY = 20; rightY = 20; pdf.setFontSize(9); }
        const wrappedText = pdf.splitTextToSize(`• ${symptom}`, columnWidth);
        pdf.text(wrappedText, leftColumnX, leftY);
        leftY += wrappedText.length * 5;
      } else {
        if (rightY > 265) { pdf.addPage(); leftY = 20; rightY = 20; pdf.setFontSize(9); }
        const wrappedText = pdf.splitTextToSize(`• ${symptom}`, columnWidth);
        pdf.text(wrappedText, rightColumnX, rightY);
        rightY += wrappedText.length * 5;
      }
    });
    
    y = Math.max(leftY, rightY) + 5;
  }

  // SECTION 2: DIFFERENTIAL DIAGNOSIS
  if (y > 250) { pdf.addPage(); y = 20; }
  
  pdf.setFontSize(13);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(43, 140, 238);
  pdf.text("2. CONDITION SPECIFIC DIAGNOSIS", 20, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  pdf.setFillColor(240, 253, 244);
  pdf.setDrawColor(34, 197, 94);
  pdf.setLineWidth(1);
  pdf.rect(20, y, 170, 20, 'FD');
  
  pdf.setFont(undefined, 'bold');
  pdf.setFontSize(11);
  pdf.text("PRIMARY RECOMMENDATION:", 25, y + 7);
  pdf.setFontSize(12);
  pdf.setTextColor(22, 163, 74);
  pdf.text(topCondition, 25, y + 15);
  pdf.setTextColor(0, 0, 0);
  y += 28;

  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text("Matched Clinical Features:", 25, y);
  y += 6;
  
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(9);
  
  if (matchedSymptoms.length > 0) {
    matchedSymptoms.forEach(item => {
      if (y > 265) { pdf.addPage(); y = 20; pdf.setFontSize(9); }
      pdf.text(`• ${item.symptom}`, 30, y);
      if (item.hpo && item.hpo !== "N/A" && item.hpo !== "") {
        pdf.setTextColor(43, 140, 238);
        pdf.text(`(${item.hpo})`, 32 + pdf.getTextWidth(`• ${item.symptom} `), y);
        pdf.setTextColor(0, 0, 0);
      }
      y += 5;
    });
  } else {
    pdf.text("No specific clinical correlations identified", 30, y);
    y += 5;
  }
  y += 8;
  
  // SECTION 3: OTHER CONDITIONS
  if (y > 245) { pdf.addPage(); y = 20; }
  
  pdf.setFontSize(13);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(43, 140, 238);
  pdf.text("3. OTHER POSSIBLE DIAGNOSTIC CONSIDERATIONS", 20, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  
  if (otherConditions.length > 0) {
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(9);
    
    otherConditions.forEach((cond, idx) => {
      if (y > 265) { pdf.addPage(); y = 20; }
      pdf.setFont(undefined, 'bold');
      pdf.text(`${idx + 1}. ${cond}`, 25, y);
      pdf.setFont(undefined, 'normal');
      y += 6;
    });
  } else {
    pdf.setFont(undefined, 'normal');
    pdf.text("No alternative diagnoses identified with significant correlation", 25, y);
    y += 6;
  }
  y += 8;

  // DISCLAIMER
  if (y > 250) { pdf.addPage(); y = 20; }
  
  pdf.setFillColor(255, 250, 240);
  pdf.rect(20, y, 170, 30, 'F');
  
  pdf.setFontSize(10);
  pdf.setFont(undefined, 'bold');
  pdf.text("IMPORTANT CLINICAL DISCLAIMER", 25, y + 7);
  
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  
  const disclaimer = "This report provides a computational analysis based on phenotypic presentation and should not replace comprehensive clinical evaluation. Final diagnosis must be confirmed through appropriate clinical, laboratory, and genetic testing. This tool is designed to assist in prioritizing differential diagnoses and should be interpreted in conjunction with complete medical history, physical examination, and additional diagnostic investigations.";
  
  const disclaimerLines = pdf.splitTextToSize(disclaimer, 160);
  pdf.text(disclaimerLines, 25, y + 14);
  y += 35;
  
  // FOOTER
  pdf.setDrawColor(200, 200, 200);
  pdf.line(20, y, 190, y);
  y += 5;
  
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text("NMPhenoscore Clinical Decision Support System", 105, y, { align: "center" });
  y += 4;
  pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 105, y, { align: "center" });

    // APPEND UPLOADED FILES - WITH EXTENSIVE DEBUGGING
  console.log("=== CHECKING UPLOADED FILES ===");
  console.log("uploadedItems array exists:", typeof uploadedItems !== 'undefined');
  console.log("uploadedItems length:", uploadedItems ? uploadedItems.length : 0);
  console.log("uploadedItems content:", JSON.stringify(uploadedItems, null, 2));
  
  if (!uploadedItems || uploadedItems.length === 0) {
    console.warn("No uploaded items found!");
    const safeName = patientName.replace(/[^a-zA-Z0-9]/g, "_");
    pdf.save(`${safeName}_NMPhenoscore_Report.pdf`);
    return;
  }
  
  let totalImageCount = 0;
  let pdfPageCount = 0;
  
  uploadedItems.forEach((item, index) => {
    console.log(`Item ${index}:`, {
      name: item.name,
      type: item.type,
      status: item.status,
      hasFile: !!item.file,
      hasImages: !!item.images,
      imagesLength: item.images?.length || 0
    });
    
    if (item.type === "image") {
      totalImageCount++;
    } else if (item.type === "pdf" && item.status === "ready" && item.images) {
      console.log(`PDF item "${item.name}" has ${item.images.length} images`);
      totalImageCount += item.images.length;
      pdfPageCount += item.images.length;
    }
  });
  
  console.log("Total images to add:", totalImageCount);
  console.log("PDF pages to add:", pdfPageCount);
  
  if (totalImageCount > 0) {
    pdf.addPage();
    let attachY = 20;

    pdf.setFontSize(14);
    pdf.setFont(undefined, "bold");
    pdf.setTextColor(0, 0, 0);
    pdf.text("Attached Clinical Images / Reports", 105, attachY, { align: "center" });
    attachY += 8;
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, "normal");
    pdf.setTextColor(80, 80, 80);
    const imageOnlyCount = uploadedItems.filter(i => i.type === "image").length;
    const summary = `${imageOnlyCount} image file(s)${pdfPageCount > 0 ? ` + ${pdfPageCount} PDF page(s) converted to images` : ''}`;
    pdf.text(summary, 105, attachY, { align: "center" });
    attachY += 12;

    // Process each item sequentially
    for (let i = 0; i < uploadedItems.length; i++) {
      const item = uploadedItems[i];
      console.log(`\n=== Processing item ${i + 1}/${uploadedItems.length} ===`);
      console.log("Item details:", {
        name: item.name,
        type: item.type,
        status: item.status
      });
      
      // HANDLE IMAGE FILES
      if (item.type === "image" && item.file) {
        console.log("→ Processing as IMAGE");
        try {
          if (attachY > 230) {
            pdf.addPage();
            attachY = 20;
          }

          console.log("Reading image file...");
          const dataUrl = await fileToDataURL(item.file);
          console.log("Image data URL length:", dataUrl.length);
          
          let imgFormat = "JPEG";
          if (dataUrl.includes("image/png")) imgFormat = "PNG";
          else if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) imgFormat = "JPEG";
          else if (dataUrl.includes("image/gif")) imgFormat = "GIF";

          const props = pdf.getImageProperties(dataUrl);
          const pageWidth = 170;
          const imgWidth = pageWidth;
          const imgHeight = (props.height * imgWidth) / props.width;

          const maxHeight = 200;
          let finalWidth = imgWidth;
          let finalHeight = imgHeight;
          
          if (imgHeight > maxHeight) {
            const scaleFactor = maxHeight / imgHeight;
            finalWidth = imgWidth * scaleFactor;
            finalHeight = maxHeight;
          }

          const xPos = (210 - finalWidth) / 2;

          pdf.addImage(dataUrl, imgFormat, xPos, attachY, finalWidth, finalHeight);
          attachY += finalHeight + 5;

          pdf.setFontSize(9);
          pdf.setFont(undefined, "normal");
          pdf.setTextColor(100, 100, 100);
          pdf.text(item.name, 105, attachY, { align: "center" });
          attachY += 12;
          pdf.setTextColor(0, 0, 0);
          console.log("✓ Image added successfully");
        } catch (error) {
          console.error("✗ Error adding image:", error);
          pdf.setFontSize(10);
          pdf.setTextColor(200, 0, 0);
          pdf.text(`⚠ Error loading image: ${item.name}`, 25, attachY);
          attachY += 15;
          pdf.setTextColor(0, 0, 0);
        }
      }
      
      // HANDLE PDF FILES (converted to images)
      else if (item.type === "pdf" && item.status === "ready" && item.images && item.images.length > 0) {
        console.log("→ Processing as PDF with", item.images.length, "pages");
        
        try {
          if (attachY > 250) {
            pdf.addPage();
            attachY = 20;
          }
          
          pdf.setFontSize(11);
          pdf.setFont(undefined, "bold");
          pdf.setTextColor(0, 0, 0);
          const cleanName = item.name.replace(/[^\x00-\x7F]/g, '');
          pdf.text(`PDF: ${cleanName} (${item.images.length} page${item.images.length > 1 ? 's' : ''})`, 105, attachY, { align: "center" });
          attachY += 10;

          for (let pageIdx = 0; pageIdx < item.images.length; pageIdx++) {
            const pageImg = item.images[pageIdx];
            console.log(`  → Adding page ${pageImg.pageNum}/${item.images.length}`);
            
            try {
              if (attachY > 230) {
                pdf.addPage();
                attachY = 20;
              }

              console.log("    Data URL length:", pageImg.dataUrl.length);
              const props = pdf.getImageProperties(pageImg.dataUrl);
              console.log("    Image dimensions:", props.width, "x", props.height);
              
              const pageWidth = 170;
              const imgWidth = pageWidth;
              const imgHeight = (props.height * imgWidth) / props.width;

              const maxHeight = 200;
              let finalWidth = imgWidth;
              let finalHeight = imgHeight;
              
              if (imgHeight > maxHeight) {
                const scaleFactor = maxHeight / imgHeight;
                finalWidth = imgWidth * scaleFactor;
                finalHeight = maxHeight;
              }

              const xPos = (210 - finalWidth) / 2;

              pdf.addImage(pageImg.dataUrl, "JPEG", xPos, attachY, finalWidth, finalHeight);
              attachY += finalHeight + 5;

              pdf.setFontSize(8);
              pdf.setFont(undefined, "normal");
              pdf.setTextColor(100, 100, 100);
              pdf.text(`Page ${pageImg.pageNum} of ${item.images.length}`, 105, attachY, { align: "center" });
              attachY += 10;
              pdf.setTextColor(0, 0, 0);
              console.log("    ✓ Page added successfully");
            } catch (error) {
              console.error("    ✗ Error adding PDF page:", error);
              pdf.setFontSize(9);
              pdf.setTextColor(200, 0, 0);
              pdf.text(`⚠ Error loading page ${pageImg.pageNum}`, 25, attachY);
              attachY += 8;
              pdf.setTextColor(0, 0, 0);
            }
          }
          
          attachY += 5;
          console.log("✓ PDF processing complete");
        } catch (error) {
          console.error("✗ Error processing PDF:", error);
        }
      }
      
      // HANDLE FAILED PDF CONVERSIONS
      else if (item.type === "pdf" && item.status === "error") {
        console.log("→ PDF conversion failed, showing error");
        if (attachY > 260) {
          pdf.addPage();
          attachY = 20;
        }
        
        pdf.setFillColor(254, 226, 226);
        pdf.rect(20, attachY - 3, 170, 15, 'F');
        
        pdf.setFontSize(10);
        pdf.setFont(undefined, "bold");
        pdf.setTextColor(153, 27, 27);
        const cleanName = item.name.replace(/[^\x00-\x7F]/g, '');
        pdf.text(`Failed to convert: ${cleanName}`, 25, attachY + 3);
        
        pdf.setFontSize(8);
        pdf.setFont(undefined, "normal");
        pdf.text("This PDF could not be converted. Please attach separately.", 25, attachY + 8);
        attachY += 20;
        pdf.setTextColor(0, 0, 0);
      }
      
      else {
        console.log("→ Item skipped (type:", item.type, ", status:", item.status, ")");
      }
    }
  }

  console.log("=== PDF GENERATION COMPLETE ===");
  const safeName = patientName.replace(/[^a-zA-Z0-9]/g, "_");
  pdf.save(`${safeName}_NMPhenoscore_Report.pdf`);
}

// Initialize
(async () => {
    const loaded = await loadData();
    if (loaded) await fetchAllSymptoms();
    else resultsDiv.innerHTML = `<div class="error"><p>Error: Failed to load data files.</p></div>`;
})();
