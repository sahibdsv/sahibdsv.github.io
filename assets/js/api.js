/* assets/js/api.js */

const FALLBACK_CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv"
};

async function loadData() {
    let config = FALLBACK_CONFIG;
    try {
        const cfgRes = await fetch('assets/config.json');
        if (cfgRes.ok) config = await cfgRes.json();
    } catch (e) { console.warn("Config fetch failed, using fallback URLs."); }

    const [main, quotes] = await Promise.all([
        fetchCSV(config.main_sheet), 
        fetchCSV(config.quotes_sheet).catch(()=>[])
    ]);

    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => {
        if(typeof Papa === 'undefined') return rej(new Error("PapaParse library not loaded. Check your internet connection."));
        Papa.parse(u, { 
            download: true, header: true, skipEmptyLines: true, 
            complete: (r) => res(r.data), 
            error: (e) => rej(new Error("CSV Error: " + e.message)) 
        });
    });
}