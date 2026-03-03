import os
import glob
from rembg import remove
from PIL import Image

input_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\advirus-evolution\variant 1"
output_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\advirus-evolution\public\assets\monsters"

os.makedirs(output_dir, exist_ok=True)

files = glob.glob(os.path.join(input_dir, "*.jpeg"))
print(f"Found {len(files)} files to process.")

for file_path in files:
    filename = os.path.basename(file_path)
    output_filename = filename.replace('.jpeg', '.png')
    output_path = os.path.join(output_dir, output_filename)
    
    print(f"Processing {filename}...")
    try:
        input_image = Image.open(file_path)
        output_image = remove(input_image)
        output_image.save(output_path, "PNG")
        print(f"Saved to {output_filename}")
    except Exception as e:
        print(f"Error processing {filename}: {e}")

print("Processing complete!")
