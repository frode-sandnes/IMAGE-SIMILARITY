"use strict"

// Globals - loaded independently from different form elements, used for generating the varipus reports
let state = "unknown";  // the main state of multple plasses
const stateVariable = "chunkPdf2Image";
const documentIndexVariable = "documentIndex";
const documentCount = "documentCount";
const dialogState = "select files";
const parsePdfState = "chunkwise parsing of pdfs";
const saveResultsState = "saving the parsed results";

let convertedPdfTexts = [];
let convertedPdfImages = [];

let jsonTextsToJoin = [];

// speeding up or limiting size
let runOCR = ""+false;
let extractText = ""+true;
let extractImages = ""+true;
let reduceImageSizeValue = ""+true;

const runOcrVariable = "runOcrVariable";
const extractTextVariable = "extractTextVariable";
const extractImagesVariable = "extractImagesVariable";
const reduceImageSize = "reduceImageSize";

function emergencyStop()
    {
    console.log("cleaning local store...");
    localStorage.removeItem(stateVariable);
    localStorage.removeItem(documentIndexVariable);
    localStorage.removeItem(documentCount);

    localStorage.removeItem(extractTextVariable);
    localStorage.removeItem(extractImagesVariable);
    localStorage.removeItem(runOcrVariable);    
    localStorage.removeItem(reduceImageSize);  
    // refresh the browser to start over
    location.reload();  
    }
// OCR stuff
// render page in canvas with pdf.ps and the canvas image ocr'ed with tesseract
function ocrPage(page, pageNo, worker)
    {
    const desiredWidth = 1000;
//console.log("enter ocrPage")        
    return new Promise(resolve => 
        {
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = desiredWidth;
        canvas.height = (desiredWidth / viewport.width) * viewport.height;
        const renderContext = 
            {
            canvasContext: context,
            viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
            };
        page.render(renderContext).promise
            .then(() => worker.recognize(canvas.toDataURL('image/jpeg', 0.8)))
                .then(result =>
                    {
                    let text = result.data.text
//                console.log("ocrPage retrieved: ",result, text)        
                resolve({text, pageNo});
                });
        });
    }


// reset state - during debugging
//localStorage.setItem(stateVariable, dialogState); 

// state handling
function retrieveState()
    {
    state = localStorage.getItem(stateVariable) ?? dialogState;
    //console.log(`Retrieved state ${state}`);   
    //listStoresInDatabase();
    if (state != dialogState)
        {
        runOCR = localStorage.getItem(runOcrVariable);        
        extractText = localStorage.getItem(extractTextVariable);
        extractImages = localStorage.getItem(extractImagesVariable);
        reduceImageSizeValue = localStorage.getItem(reduceImageSize);
        }
//window.alert("waiting...")
    }
function getState()
    {
    return state;
    }
function changeState(previous, next)
    {
    if (state !== previous)
        {
        console.error(`State change error: trying to go from ${previous} to ${next} while in ${state}`)
        }
    localStorage.setItem(stateVariable, next);       
    console.log(`Changed state from ${previous} to ${state}`);
    location.reload();   
    }
function terminusState()
    {
    console.log(`Terminating state at ${state}`);     
    localStorage.removeItem(stateVariable);
    localStorage.removeItem(documentIndexVariable);
    localStorage.removeItem(documentCount);

    localStorage.removeItem(extractTextVariable);
    localStorage.removeItem(extractImagesVariable);
    localStorage.removeItem(runOcrVariable);    
    localStorage.removeItem(reduceImageSize);   

    // saving
    listStoresInDatabase();
    // retrieve all entries from database
    document.getElementById("cleaningId").showModal();  // signar to the user that we are done
    // Clean up by removing databases
    cleanPersistentStore()
        .then(() => 
            {
            listStoresInDatabase();
            document.getElementById("cleaningId").close(); 
            document.getElementById("finishedId").showModal();  // signar to the user that we are done
            });
    }

// Bootstrapping
window.addEventListener('DOMContentLoaded', (event) => setup());

async function setup()
    {
    // check state
    retrieveState();
//console.log({state});
    if (state == dialogState)
        {
        // show the file selector
        document.getElementById("fileSelectorId").showModal();
        // Add GUI handlers
        document.getElementById("file-selector-pdf")
                .addEventListener('change', async (event) => loadFilesPDF(event));     
        }
    else if (state == parsePdfState)
        {
        chunkwisePdfParsing();    
        }
    else if (state == saveResultsState)
        {
        saveResults();
        }
    else
        {
        console.error(`Uncrecognized state: ${state}`);
        }
    }

const N = 20; // number of reports to process for each reload
function chunkwisePdfParsing()
    {
    console.log("Chunkwise parsing of pdfs...");
    // update Gui
    document.getElementById("parsingInfoId").showModal();
    document.getElementById("currentIndexId").innerText = localStorage.getItem(documentIndexVariable);                    
    document.getElementById("totalId").innerText = localStorage.getItem(documentCount);                    

    // which items to retrieve?
    openDb(dbName)
        .then(db => // nesting promises here so db is visible inside the block 
            {
            let toProcess = []; // making it visible throughout 
            let data = [];
            let text = [];
            let documentIndex = Number(localStorage.getItem(documentIndexVariable));

            // retrieve all keys to the items
            getKeys(db, pdfSourceId)
                .then(retrieved => 
                    {
                    if (retrieved.length == 0)
                        {
                        changeState(parsePdfState, saveResultsState);
                        }
                    // retrieve first N items
                    toProcess = retrieved;
                    toProcess.length = Math.min(N, retrieved.length);
                    localStorage.setItem(documentIndexVariable, documentIndex + toProcess.length);  // update perstistent counter
                    let dataPromises = toProcess.map(name => 
                        {
                        // update GUI
                        document.getElementById("currentFileId").innerText = name;                    
                        return getObjectFromStore(db, pdfSourceId, name)
                        });
                    return Promise.all(dataPromises); // wait to retrieve all pdf-source data
                    })    // Just use the Get method on the index. This will return the first record for the given key, only disadvatage is you can't sort.
                .then(dataResults => 
                    {
                    data = dataResults;
                    let textPromises = toProcess.map(name => getObjectFromStore(db, pdfTextId, name));
                    return Promise.all(textPromises); // wait to retrieve all texts from database
                    })
                .then(textResults => 
                    {
                    text = textResults;
                    // parse each item  
                    let parsePromises = toProcess.map((name, i) => parsePdf(data[i], name, text[i], documentIndex + i));
                    return Promise.all(parsePromises);
                    })
                .then(parseResult => 
                    {
                    // save each item in db
                    let savePromises = parseResult.map((result, i) => addObjectToStore(jsonReportsId, toProcess[i], result));
                    return Promise.all(savePromises);
                    })
                .then(() => 
                    {
                    // remove processed items
                    let deletePromises = toProcess.map(name => deleteObjectFromStore(db, pdfSourceId, name));
                    return Promise.all(deletePromises);
                    })
                .then(() => 
                    {
                    // we have finished parsing the current set, therefore reload
                    location.reload();    
                    });
            });
    }


function saveResults()
    {
console.log("saving", extractText, extractImages)
    // save the text in documents
    getListFromStore(jsonReportsId)
        .then(retrieved => 
            {
            let textInfo = retrieved.map(({value}) => value);          
            if (extractText === "true")  // since the bool is saved as string.
                {
                outputJson(textInfo, "textContentFromPdf");
                }
            // retreive and save the images
            return getListFromStore(pdfImageId);
            })
        .then(retrieved => 
            {
            let imageInfo = retrieved.map(({value}) => value);
            if (extractImages === "true")  // since the bool is saved as string.
                {
                outputJson(imageInfo, "imageContentfromPdf");
                }
            terminusState();    // finished, move on.
            });
    }

// local store stuff
// indexedDB stuff
const dbName = "chunkwisePdfParse";
// Store names 
const pdfSourceId = "pdfSource";
const pdfTextId = "pdfText";
const pdfImageId = "pdfImage";
const jsonReportsId = "jsonReports";

function setupIndexedDbDatastructure()
    {
    let waitModal = document.getElementById("indexDbDialogId");
    waitModal.showModal();
    return new Promise(resolve => 
        {
        console.log("setting up db");  
        // sequential verison
        cleanPersistentStore()
            .then(() => addDbStore(pdfSourceId, 1))
            .then(() => addDbStore(pdfTextId, 2))
            .then(() => addDbStore(pdfImageId, 3))
            .then(() => addDbStore(jsonReportsId, 4))
            .then(() => 
                {
                waitModal.close();
                document.getElementById("readingFileId").showModal();    
                resolve();
                })
            .catch(error => handleIndexedDbError(error)); 
        });
    }
// called iteratively while going through the list of storeNames
function addDbStore(storeName, version)
    {
    return new Promise((resolve, reject) => 
        {      
        const request = indexedDB.open(dbName, version);
        request.onerror = (event) => reject(event);
        request.onsuccess = (event) => 
            {
            console.log("adding "+storeName);
            let db = event.target.result;
            db.close();
            console.log("added successfully!");
            resolve();
            };   
        request.onupgradeneeded = (event) => 
            {
            let db = event.target.result;
            // create objectStore structure
            const objectStore = db.createObjectStore(storeName, { keyPath: "name" });
            // allow searching via name
            objectStore.createIndex("name", "name", { unique: true });
            };     
        });
    }

function listStoresInDatabase()
    {
    // will get the most recent version without the version paramter
    const request = indexedDB.open(dbName);
    request.onerror = (event) => handleIndexedDbError(event);
    request.onsuccess = (event) => 
        {
        const db = event.target.result;              
        console.log("stores in database ");
        console.log(db.objectStoreNames);    
        };    
    }
    
function handleIndexedDbError(event)
    {
alert("indexeDB error");
    console.error("indexeDB error: ", event);        
    }

// setting up
function cleanPersistentStore()
    {
    return new Promise((resolve, reject) => 
        {
        console.log("cleaning persistent store.")
        const DBDeleteRequest = window.indexedDB.deleteDatabase(dbName);
        DBDeleteRequest.onerror = (event) => {console.log("clean ok"); reject(event)};
        DBDeleteRequest.onsuccess = (event) => {console.log("clean failed");resolve(event)};  
        });
    };

function openDb(dbName)
    {
    return new Promise((resolve, reject) => 
        {
        const request = indexedDB.open(dbName);
        request.onerror = (event) => reject(event);
        request.onsuccess = (event) => resolve(event.target.result);
        });
    }

function getKeys(db, source)
    {
   return new Promise((resolve) => 
        {  
        db
            .transaction(source)
            .objectStore(source).index("name")
            .getAllKeys().onsuccess = (event) => 
                {
                let retrieved = event.target.result;
                resolve(retrieved);
                };     
        });        
    }
   
function getObjectFromStore(db, source, name)
    {
    return new Promise((resolve) => 
        {  
        db
            .transaction(source)
            .objectStore(source)
            .get(name).onsuccess = (event) => 
                {
                let retrieved = event.target.result.value;
                resolve(retrieved);
                };     
        });
    }

function addObjectToStore(source, name, update)
    {
    return new Promise((resolve, reject) => 
        {              
        const request = indexedDB.open(dbName);
        request.onerror = (event) => reject(event);
        request.onsuccess = (event) => 
            {
            // Save the IDBDatabase interface
            const db = event.target.result;         
            const objectStore = db
                .transaction([source], "readwrite")
                .objectStore(source);
            const requestUpdate = objectStore.put({name, value:update});
            requestUpdate.onerror = (event) => reject(event);
            requestUpdate.onsuccess = (event) => 
                {
                db.close();
                resolve();
                };
            }
        });
    }

function deleteObjectFromStore(db, store, key)
    {
    return new Promise(resolve => 
        {
        openDb(dbName)
            .then(response => 
                {
                let transaction = db.transaction([store], "readwrite");
                transaction.objectStore(store).delete(key);
                // report that the data item has been deleted
                transaction.oncomplete = () => 
                    {
                    response.close();
                    resolve();
                    };
                });
        });
    }

function getListFromStore(store)
    {
    return new Promise((resolve, reject) => 
        {      
        openDb(dbName)
            .then(db => 
                {
                db.transaction(store)
                  .objectStore(store)
                  .getAll().onsuccess = (event) => 
                        {
                        let retrieved =  event.target.result;
                        resolve(retrieved);
                        }
                });
            });
    }

// reverted back to complete pdf.js to avoid dependence on doctotext.js
async function getFullText(fileOrSource) {
    let source = fileOrSource;

    // FIX: If it's a File object from an input, convert it to an ArrayBuffer
    if (fileOrSource instanceof File) {
        source = { data: await fileOrSource.arrayBuffer() };
    } 
    // If it's just a URL string, wrap it in an object
    else if (typeof fileOrSource === 'string') {
        source = { url: fileOrSource };
    }

    // Now PDF.js will be happy
    const loadingTask = pdfjsLib.getDocument(source);
    const pdf = await loadingTask.promise;
    
    const pagePromises = Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const textContent = await page.getTextContent();
        return textContent.items.map(item => item.str).join(" ");
    });

    const pagesText = await Promise.all(pagePromises);
    return pagesText.join("\n\n");
}


// Rename denne til read file contents - independent of file type
// retrieving file contents of pdf document
async function loadFilesPDF(event)
    {   
    // get custom settings from the user
    // not implemented yet - abit inovlved - maybe later?
    runOCR = document.getElementById("runOCR").checked;
    extractText = document.getElementById("extractText").checked;
    extractImages = document.getElementById("extractImages").checked;
    reduceImageSizeValue = document.getElementById("reduceImageSize").checked;
    if (!runOCR && !extractText && !extractImages)
        {
        return; // do nothing
        }
    // persistent store to survive browser reload
    runOCR = "" + runOCR;  // convert to strings from now    
    extractText = "" + extractText;
    extractImages = "" + extractImages;
    reduceImageSizeValue = "" + reduceImageSizeValue;
    localStorage.setItem(extractTextVariable, extractText);
    localStorage.setItem(extractImagesVariable, extractImages);
    localStorage.setItem(runOcrVariable, runOCR); 
    localStorage.setItem(reduceImageSize, reduceImageSizeValue); 
    
    console.log("Loading and storing pdfs...");    
    document.getElementById("fileSelectorId").close();
    await setupIndexedDbDatastructure();         
    localStorage.setItem(documentCount, event.target.files.length);    
    const files = event.target.files;
    for (let i = 0, file; file = files[i]; i++) 
        {		
        const {name} = file;
        await new Promise(resolve => 
            {
            getFullText(file)
                .then(correctedText =>
                    {
                    addObjectToStore(pdfTextId, name, correctedText)   
                        .then(() => console.log("saved text", correctedText));
                    let reader = new FileReader();
                    reader.onload = (function(e) 
                        {
                        return function(e) 
                            {
                            // get the data
                            let data = new Uint8Array(e.target.result);    
                            // store the data in the indexDB
                            addObjectToStore(pdfSourceId, name, data)
                                .then(() => 
                                    {           ;
                                    resolve();
                                    })      
                            };
                        })(file);
                    reader.onerror = () =>
                        {
                        // resolve and try to recover.
                        alert("pdf-file reader problem..."+name);
                        resolve();
                        };	
                    reader.readAsArrayBuffer(file);		
                    })
              .catch(error => { alert("Problem reading "+name);
                                console.log(error);
    throw "problem"
                                // try to recover with no data
                         //       addObjectToStore(pdfTextId, name, "--- FAILED doc reader, no data ---");   
                            resolve();
                            }); 
            });        
        }
    // state logic
    listStoresInDatabase();
    changeState(dialogState, parsePdfState);
    // set documentIndex counter to 0
    localStorage.setItem(documentIndexVariable, 0);
    }  


// language string used for tesseract OCR
const language = "nor";
//    const language = "eng";
function parsePdf(binaryData, name, alternativeText, documentIndex)
    {    
    let worker; // make it visible in full function scope
    let pages = [];
    return new Promise(resolve => 
        {
        Tesseract.createWorker(language)
            .then(wk => 
                {
                worker = wk;
                const loadingTask = pdfjsLib.getDocument({data: binaryData, nativeImageDecoderSupport: 'none', verbosity: 0});
                return loadingTask.promise        
                })
            .then(pdf =>  
                {
                const totalPages = pdf.numPages;    
                for (let j = 1; j <= totalPages; j++)
                    {
                    pages.push(pdf.getPage(j));                    
                    }
                Promise.all(pages).then((pagesLocal) =>      // first wait for all pages to load 
                    {
                    pages = pagesLocal; // make certain we keep it for future reference
console.log(runOCR)                    
                    let ocrPromises = runOCR === "true" // since the bool is saved as string.
                        ? pages.map((page, pageNo) => ocrPage(page, pageNo, worker))
                        : [new Promise(resolve => resolve([]))];    // return empty array - avoid the time-consuming mapping
                    return Promise.all(ocrPromises);     
                    })
                .then(ocrText =>
                    { 
                console.log(ocrText) 
                    // get page contents
                    let pageContents = pages.map(page => page.getTextContent());
                    Promise.all(pageContents).then((contents) => // then, wait for all contents to be extracted
                        {
                        let textPages = contents.map(content => 
                            {
                            let items = content.items;
                            let text = items.map(({str}) => str).join(" ");
                            return text;
                            })
                        let fullText = textPages.join(" ");
                        let prevValue = 0;
                        let pageIndices = textPages.map((text) => prevValue += text.length);   
                        // get image stats
                        let operators = pages.map(page => page.getOperatorList());
                        // then, wait for all contents to be extracted                    
                        Promise.all(operators).then((opsList) => extractImagesFromPdf(opsList, pages, documentIndex, name))
                                            .then(noImages =>
                            {
                            // if the other library is ok it should contain spaces
                            // some problems with Google Docs resulting in no spaces - in such cases resort to the pdf.js version instead
                            let report = {};
                            if ((alternativeText.match(/ /g) || []).length > 0) // yes there are spaces
                                {
                                // correct page numbers
                                const correctedTextLength = alternativeText.length;
                                const pageNoScalingFactor = correctedTextLength / fullText.length;
                                // adjust page numbers accordingly
                                pageIndices = pageIndices.map(pageIndex => Math.round(pageIndex * pageNoScalingFactor));
                                // finally pack up the results
                                report = {text: alternativeText, ocrText, noPages: totalPages, filename: name, pageIndices: pageIndices, noImages: noImages};
                                }
                            else    // resort to pdf.js (google docs etc)    
                                {
                                report = {text: fullText, noPages: totalPages, filename: name, pageIndices: pageIndices, noImages: noImages};
                                }
                            // finally pack up the results
                            resolve(report);
                            });
                        });
                    })
                })        
            .catch(err => {alert("pdf-parse error "+name);
                            console.log(err)});
        });
    }


function outputJson(jsonObject, outputFilename)
    {
    saveTextFile(JSON.stringify(jsonObject, null, 2), outputFilename+".json");
    }
// using the fileSave library to output file  
function saveTextFile(text, filename)  
    {
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    saveAs(blob, filename);
    }

const maxDimension = 300; // adjust for desired max resolution of the extracted images for the largest dimension

// extracting images
const validObjectTypes = 
    [
    pdfjsLib.OPS.paintImageXObject, // 85
    pdfjsLib.OPS.paintImageXObjectRepeat, // 88
    pdfjsLib.OPS.paintJpegXObject //82
    ];

// opsList contain operator lists for all the pages of a pdf
// previous method of trying to detect images from operator list failed for non-jpeg images.
// Therefore, using a deprecated pdf to svg rendering api in pdf.js.
// After rendering the svg for each page, each image is extracted from the resulting DOM,
// downsampled and saved. This approach is hacky but seems quite flexible and robust
// This routine places images directly in the image store directly.
function extractImagesFromPdf(opsList, pages, documentIndex, name)
    {
    return new Promise(mainResolve => // return a promise with the number of imagex extracted
        {
        // i refer to the index of the page and operator array
        if (opsList.length == 0)
            {
            mainResolve(0); // abort if nothing to process
            return;   
            }
        // preparatory phase: find the viewports of each page 
        let viewports = opsList.map((ops, page) => pages[page].getViewport(1 /*scale*/));

        // first phase: go trhough operator list and render pages in svg format
        let svgPromises = opsList.map((ops, page) => // for each page
            {
            // SVG rendering with PDF.js
//            let svgGfx = new PDFJS.SVGGraphics(pages[page].commonObjs, pages[page].objs);
// By accident referring to old PDFJS in doctotext.  Also need to ensure that it is not to new as the svg code is deprecated.  Look into this later.
            let svgGfx = new pdfjsLib.SVGGraphics(pages[page].commonObjs, pages[page].objs);
            return svgGfx.getSVG(ops, viewports[page]);
            });

        // Phase two: wait for all the svg to be rendered  
        Promise.all(svgPromises)
            .then((svgList) => 
                {
                // Traverse all pages rendered as svg.
                let urlDataList = getImageUrlFromSVG(svgList, viewports)               
                // Step three: traverse the list of image URLs and extract the image data. Return as array of promises as loading can take time.
                let imagePromises = urlDataList.map(urlInfo => getImageFromUrl({...urlInfo, documentIndex, name}));
                // Step five: wait for all the images to finish, then resolve             
                return Promise.allSettled(imagePromises);
                })
            .then((results) =>  // the length of the results array indicates the number of retrieved images
                {
                mainResolve(results.length);   // report number of images that were retrieved.
                return;
                })                      
            .catch((error) =>  { alert("image extraction error "+name); 
                                mainResolve(0); // ignore images for this one - detected with some latex files.
                                console.error(error)});   // ensure we also capture errors at the end of the promise chain                          
        });
    }
    
// helper: Extract URL-paths of the images
// There may be more than one image on a page, therefore the array is flattened.
function getImageUrlFromSVG(svgList, viewports)
    {
    return svgList.map((svg, page) => 
        {
        // temporary DOM tree for the svg
        let container = document.createElement('div');
        container.style.width = viewports[page].width + 'px';
        container.style.height = viewports[page].height + 'px';
        // The rendered page is now in the svg
        container.appendChild(svg);
        // Extract all potential images on the svg page.
        let images = container.getElementsByTagName("svg:image");
        if (images.length == 0)
            {
            return;                         // Just ordinary return from array method here ok since it is not mapped to Promise.    
            }
        // accumulate URLs
        let urlDataListLocal = [];
        for (const image of images)  // check each instance for embedded URL-data 
            {
            // extract part denoting url link to image data
            const urlData = image.getAttribute("xlink:href");
            if (urlData.length > 0) // check that it is the case
                {
                urlDataListLocal.push({urlData, page});
                }
            }
        container.remove(); // Explicitly free up space for garbage collection
        return urlDataListLocal;
        })
            .flat()
            .filter(data => data != undefined);
    }

function getImageFromUrl({urlData, page, documentIndex, name})
    {
    return new Promise(imageLoadResolve => 
        {
        //  we load the data into a html image so that we can make a downscaled copy
        let el = document.createElement("img");
        el.src = urlData;
        // uncomment this to see the image being processed
        // document.body.appendChild(el);
        el.onload = () => 
            {
            // Once loaded, create a reized copy
            let imageWidth = el.width;
            let imageHeight = el.height;
            // reducing based on choice specified by the user - default is to reduce
            if (reduceImageSizeValue === "true")
                {
                let maxDim = Math.max(imageWidth, imageHeight);
                let imageScale = (maxDim > maxDimension)
                        ? maxDimension/maxDim
                        : 1;
                imageWidth = Math.round(imageWidth * imageScale);
                imageHeight = Math.round(imageHeight * imageScale);
                }
            createImageBitmap(el, { resizeWidth: imageWidth, resizeHeight: imageHeight, resizeQuality: 'high' })
                .then(imageBitmap => 
                    {
                    let canvas = document.createElement("canvas");
                    canvas.width = imageBitmap.width;
                    canvas.height = imageBitmap.height;
                    let ctx = canvas.getContext("2d");
                    ctx.drawImage(imageBitmap, 0, 0);
                    let imageURL = canvas.toDataURL();
                    // uncomment to view downsampled images
                    // document.body.appendChild(canvas);
                    console.clear();    // get rid of image processing "noise" from pdfjs
                    canvas.remove();   
                    el.remove();
                    // just generate a unique primary key that will not collide with others.
                    let primaryKey = Date.now() + "-" + Math.random();  
                    return addObjectToStore(pdfImageId, primaryKey, {documentIndex, name, imageURL,page,imageWidth:imageBitmap.width, imageHeight:imageBitmap.height});
                    })
                .then(() => imageLoadResolve()) // indicate that we are done  
                .cath(() => imageLoadResolve());    /* added */              
            }   
        el.onerror = () => { imageLoadResolve() };   /* added */         
        })
    }

