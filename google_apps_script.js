/**
 * Google Apps Script - Master Data Pelatihan API Wrapper
 * 
 * Tempatkan kode ini di Google Sheets Anda:
 * Extensions -> Apps Script -> Ganti semua kode dengan kode ini.
 * Simpan dan klik 'Deploy' -> 'New deployment' -> 'Web app'.
 * Atur:
 * - Execute as: Me
 * - Who has access: Anyone
 */

function doGet(e) {
  // Fitur Pencarian File Google Drive dinamis saat diklik download/view
  var action = e && e.parameter && e.parameter.action;
  if (action === "getFile") {
    var filename = e.parameter.filename;
    var result = { url: null, found: false };
    if (filename) {
      try {
        // Cari file dengan nama persis atau mengandung nama tersebut (agar tidak sensitif terhadap ekstensi seperti .pdf)
        // Gunakan escape untuk mencegah error karakter khusus
        var safeFilename = filename.replace(/'/g, "\\'");
        var files = DriveApp.searchFiles("title contains '" + safeFilename + "' and trashed = false");
        
        if (files.hasNext()) {
          var file = files.next();
          result.url = file.getUrl();
          result.id = file.getId();
          result.found = true;
        } else {
          // Coba cari sebagai folder jika file tidak ditemukan
          var folders = DriveApp.searchFolders("title contains '" + safeFilename + "' and trashed = false");
          if (folders.hasNext()) {
            var folder = folders.next();
            result.url = folder.getUrl();
            result.id = folder.getId();
            result.found = true;
          }
        }
      } catch (err) {
        result.error = err.toString();
      }
    }
    var callback = e && e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }


  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  var sheet = sheets[0]; // Menggunakan sheet pertama
  var rows = sheet.getDataRange().getDisplayValues();
  
  // Ambil semua RichTextValue dalam satu panggilan (untuk membaca hyperlink di sel)
  var richTextValues = sheet.getDataRange().getRichTextValues();
  var formulas = sheet.getDataRange().getFormulas();
  
  // Mencari letak baris header data
  var startIndex = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === "No." || rows[i][1] === "Kegiatan" || rows[i][1] === "Kegiatan Pelatihan") {
      startIndex = i + 3; // Melewati header, baris kosong, dan From/To sub-header
      break;
    }
  }
  if (startIndex === 0) startIndex = 3; // Fallback jika tidak terdeteksi
  
  var data = [];
  var currentKegiatan = null;
  var currentNo = null;
  
  var docKeys = [
    "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
    "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
    "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
    "notulen_rapat_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
    "rekap_nilai", "absensi", "biodata_pengajar", "ktp_npwp", "materi",
    "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
  ];

  
  for (var i = startIndex; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 3) continue;
    
    var noVal = row[0] ? row[0].toString().trim() : "";
    var kegiatanVal = row[1] ? row[1].toString().trim() : "";
    var aktVal = row[2] ? row[2].toString().trim() : "";
    
    // Jika baris kosong, lewati
    if (noVal === "" && kegiatanVal === "" && aktVal === "") continue;
    
    // Menurunkan data Kegiatan jika kosong (untuk baris Angkatan berikutnya)
    if (noVal === "" && kegiatanVal === "") {
      if (!currentKegiatan) continue;
    } else {
      currentNo = noVal;
      currentKegiatan = kegiatanVal;
    }
    
    var fromDate = row[3] ? row[3].toString().trim() : "";
    var toDate = row[4] ? row[4].toString().trim() : "";
    var waktu = fromDate;
    if (toDate !== "") {
      waktu = fromDate + " s.d. " + toDate;
    }
    
    // Parse Pengajar (baris baru dipisah)
    var pengajarVal = row[13] ? row[13].toString().trim() : "";
    var pengajar = [];
    if (pengajarVal !== "") {
      pengajar = pengajarVal.split('\n').map(function(t) { return t.trim(); }).filter(Boolean);
    }
    
    // Parse Dokumen (index 15 s.d 37)
    var docs = {};
    for (var d = 0; d < docKeys.length; d++) {
      var colIdx = 15 + d;
      var val = row[colIdx] ? row[colIdx].toString().trim() : "";
      if (["none", "-", "", "null"].indexOf(val.toLowerCase()) !== -1) {
        docs[docKeys[d]] = null;
      } else {
        var cellLink = null;
        if (richTextValues && richTextValues[i] && richTextValues[i][colIdx]) {
          cellLink = richTextValues[i][colIdx].getLinkUrl();
        }
        
        // Fallback: Ekstrak link dari formula =HYPERLINK("url", "nama")
        if (!cellLink && formulas && formulas[i] && formulas[i][colIdx]) {
          var formula = formulas[i][colIdx];
          var match = formula.match(/=(?:HYPERLINK|hyperlink)\(\s*["']([^"']+)["']/i);
          if (match && match[1]) {
            cellLink = match[1];
          }
        }
        
        var files = val.split('\n').map(function(f) { return f.trim(); }).filter(Boolean);
        
        if (cellLink) {
          docs[docKeys[d]] = { name: files[0] || val, url: cellLink };
        } else if (val.toLowerCase().indexOf('http') === 0) {
          // Jika admin mengisi raw URL secara langsung dari portal
          docs[docKeys[d]] = { name: "Buka Dokumen", url: val };
        } else {
          docs[docKeys[d]] = files.length > 1 ? files : files[0];
        }
      }
    }
    
    var batch = {
      "akt": aktVal,
      "waktu_pelaksanaan": waktu,
      "from_date": fromDate,
      "to_date": toDate,
      "triwulan": row[5] ? row[5].toString().trim() : "",
      "jumlah_hari": row[7] ? row[7].toString().trim() : "",
      "jumlah_jp": row[8] ? row[8].toString().trim() : "",
      "jp_berbayar": row[9] ? row[9].toString().trim() : "",
      "total_peserta": row[10] ? row[10].toString().trim() : "",
      "lulus": row[11] ? row[11].toString().trim() : "",
      "tidak_lulus": row[12] ? row[12].toString().trim() : "",
      "pengajar": pengajar,
      "tempat": row[14] ? row[14].toString().trim() : "",
      "documents": docs
    };
    
    // Cari apakah Kegiatan sudah ada di array hasil
    var existing = null;
    for (var k = 0; k < data.length; k++) {
      if (data[k].kegiatan === currentKegiatan) {
        existing = data[k];
        break;
      }
    }
    
    if (existing) {
      existing.angkatan.push(batch);
    } else {
      data.push({
        "no": currentNo,
        "kegiatan": currentKegiatan,
        "jumlah_akt": row[6] ? row[6].toString().trim() : "1",
        "angkatan": [batch]
      });
    }
  }
  
  // Mendukung JSONP callback untuk bypass CORS dari browser
  var callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    var sheet = sheets[0];
    var rows = sheet.getDataRange().getValues();
    
    // Mencari baris awal data
    var startIndex = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === "No." || rows[i][1] === "Kegiatan") {
        startIndex = i + 3;
        break;
      }
    }
    if (startIndex === 0) startIndex = 3;
    
    // Hapus baris data lama (sisakan header & subheader)
    var lastRow = sheet.getLastRow();
    if (lastRow >= startIndex) {
      sheet.deleteRows(startIndex, lastRow - startIndex + 1);
    }
    
    // Konversi objek database UI ke dalam baris-baris spreadsheet
    var rowsToWrite = [];
    var docKeys = [
      "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
      "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
      "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
      "notulen_rapat_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
      "rekap_nilai", "absensi", "biodata_pengajar", "ktp_npwp", "materi",
      "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
    ];
    
    postData.forEach(function(keg) {
      keg.angkatan.forEach(function(ang, idx) {
        var row = [];
        row.push(idx === 0 ? keg.no : "");
        row.push(idx === 0 ? keg.kegiatan : "");
        row.push(ang.akt || "");
        row.push(ang.from_date || "");
        row.push(ang.to_date || "");
        row.push(ang.triwulan || "");
        row.push(idx === 0 ? keg.jumlah_akt || keg.angkatan.length.toString() : "");
        row.push(ang.jumlah_hari || "");
        row.push(ang.jumlah_jp || "");
        row.push(ang.jp_berbayar || "");
        row.push(ang.total_peserta || "");
        row.push(ang.lulus || "");
        row.push(ang.tidak_lulus || "");
        
        var teachers = Array.isArray(ang.pengajar) ? ang.pengajar.join('\n') : (ang.pengajar || "");
        row.push(teachers);
        
        row.push(ang.tempat || "");
        
        // Menulis dokumen (index 15 s.d 37)
        docKeys.forEach(function(key) {
          var val = ang.documents ? ang.documents[key] : null;
          if (!val) {
            row.push("");
          } else if (Array.isArray(val)) {
            row.push(val.join('\n'));
          } else {
            row.push(val);
          }
        });
        
        rowsToWrite.push(row);
      });
    });
    
    if (rowsToWrite.length > 0) {
      var range = sheet.getRange(startIndex, 1, rowsToWrite.length, rowsToWrite[0].length);
      range.setValues(rowsToWrite);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
