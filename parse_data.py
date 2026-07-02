import csv
import json
import os

def parse_csv():
    csv_path = "/Users/syahril/.gemini/antigravity-ide/brain/10739bc5-7e20-474f-af1b-af3e7ee0a0c7/.system_generated/steps/7/content.md"
    
    # Read raw content and find where CSV data starts
    with open(csv_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # The actual CSV starts after '---'
    csv_start_index = 0
    for idx, line in enumerate(lines):
        if line.strip() == '---':
            csv_start_index = idx + 1
            break
            
    csv_content = "".join(lines[csv_start_index:])
    
    # Read with CSV reader
    reader = csv.reader(csv_content.strip().splitlines())
    
    headers = next(reader)
    # Skip empty spacer row and "From/To" header row
    next(reader) # Row 15: empty spacer
    next(reader) # Row 16: From, To header
    
    data = []
    current_kegiatan = None
    current_no = None
    
    doc_keys = [
        "kurikulum", "kak", "undangan_rapat_persiapan", "notulen_rapat_persiapan",
        "permohonan_narsum", "surat_permohonan_peserta", "panggilan_peserta",
        "sk_penunjukan", "st_penyelenggara", "st_wi", "undangan_rapat_evaluasi",
        "notulen_rapat_evaluasi", "sk_penetapan", "surat_pengembalian_peserta",
        "rekap_nilai", "absensi", "biodata_pengajar", "ktp_npwp", "materi",
        "jadwal", "laporan_akhir", "dokumentasi", "hasil_evaluasi"
    ]
    
    for row in reader:
        if not row or len(row) < 3:
            continue
            
        no_val = row[0].strip()
        kegiatan_val = row[1].strip()
        akt_val = row[2].strip()
        
        # If no_val and kegiatan_val are empty, this is a sub-row (another batch of the current training)
        if not no_val and not kegiatan_val:
            if not current_kegiatan:
                continue # Skip if there's no parent activity yet
        else:
            current_no = no_val
            current_kegiatan = kegiatan_val
            
        # Parse dates
        from_date = row[3].strip()
        to_date = row[4].strip() if len(row) > 4 else ""
        
        waktu = from_date
        if to_date:
            waktu = f"{from_date} s.d. {to_date}"
            
        # Parse documents (columns index 15 to 37)
        docs = {}
        for idx, key in enumerate(doc_keys):
            col_idx = 15 + idx
            val = row[col_idx].strip() if col_idx < len(row) else ""
            # Clean up values
            if val.lower() in ["none", "-", "", "null"]:
                docs[key] = None
            else:
                # Can be multiple files split by newlines
                files = [f.strip() for f in val.split('\n') if f.strip()]
                docs[key] = files if len(files) > 1 else files[0]
                
        # Parse teachers
        pengajar_val = row[14].strip() if len(row) > 14 else ""
        pengajar = [p.strip() for p in pengajar_val.split('\n') if p.strip()] if pengajar_val else []
        
        batch = {
            "akt": akt_val,
            "waktu_pelaksanaan": waktu,
            "from_date": from_date,
            "to_date": to_date,
            "triwulan": row[5].strip() if len(row) > 5 else "",
            "jumlah_hari": row[7].strip() if len(row) > 7 else "",
            "jumlah_jp": row[8].strip() if len(row) > 8 else "",
            "jp_berbayar": row[9].strip() if len(row) > 9 else "",
            "total_peserta": row[10].strip() if len(row) > 10 else "",
            "lulus": row[11].strip() if len(row) > 11 else "",
            "tidak_lulus": row[12].strip() if len(row) > 12 else "",
            "pengajar": pengajar,
            "tempat": row[15].strip() if len(row) > 15 else "",
            "documents": docs
        }
        
        # Check if kegiatan already exists in data
        existing_kegiatan = next((item for item in data if item["kegiatan"] == current_kegiatan), None)
        if existing_kegiatan:
            existing_kegiatan["angkatan"].append(batch)
        else:
            data.append({
                "no": current_no,
                "kegiatan": current_kegiatan,
                "jumlah_akt": row[6].strip() if len(row) > 6 else "1",
                "angkatan": [batch]
            })
            
    # Output to data.js
    output_js_path = "/Users/syahril/Documents/Master Data Pelatihan Pengembangan Kompetensi Pemerintahan dan Teknis/data.js"
    with open(output_js_path, 'w', encoding='utf-8') as f:
        f.write("// Automatically generated database from Google Spreadsheet\n")
        f.write("const INITIAL_DATA = ")
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(";\n")
        
    print(f"Successfully parsed {len(data)} training activities and written to data.js")

if __name__ == "__main__":
    parse_csv()
