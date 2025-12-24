// ===== APPEND UPLOADED FILES =====
if (uploadedItems.length > 0) {
  pdf.addPage();
  let attachY = 20;

  pdf.setFontSize(14);
  pdf.setFont(undefined, "bold");
  pdf.setTextColor(0, 0, 0);
  pdf.text("Attached Clinical Images / Reports", 105, attachY, { align: "center" });
  attachY += 15;

  for (const item of uploadedItems) {
    if (!item.file) continue;

    // Handle images
    if (item.type === "image") {
      try {
        if (attachY > 240) {
          pdf.addPage();
          attachY = 20;
        }

        const dataUrl = await fileToDataURL(item.file);
        
        // Detect image format from data URL
        let imgFormat = "JPEG";
        if (dataUrl.includes("image/png")) imgFormat = "PNG";
        else if (dataUrl.includes("image/jpeg") || dataUrl.includes("image/jpg")) imgFormat = "JPEG";

        const props = pdf.getImageProperties(dataUrl);
        const pageWidth = 170;
        const imgWidth = pageWidth;
        const imgHeight = (props.height * imgWidth) / props.width;

        // Ensure image fits on page
        const maxHeight = 220;
        let finalWidth = imgWidth;
        let finalHeight = imgHeight;
        
        if (imgHeight > maxHeight) {
          const scaleFactor = maxHeight / imgHeight;
          finalWidth = imgWidth * scaleFactor;
          finalHeight = maxHeight;
        }

        // Center the image horizontally
        const xPos = (210 - finalWidth) / 2;

        pdf.addImage(dataUrl, imgFormat, xPos, attachY, finalWidth, finalHeight);
        attachY += finalHeight + 5;

        // Add filename caption
        pdf.setFontSize(9);
        pdf.setFont(undefined, "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text(item.name, 105, attachY, { align: "center" });
        attachY += 10;
        pdf.setTextColor(0, 0, 0);
      } catch (error) {
        console.error("Error adding image to PDF:", error, item.name);
        pdf.setFontSize(10);
        pdf.setTextColor(200, 0, 0);
        pdf.text(`⚠ Error loading image: ${item.name}`, 25, attachY);
        attachY += 10;
        pdf.setTextColor(0, 0, 0);
      }
    }
    
    // Handle PDFs - add a note
    if (item.type === "pdf") {
      if (attachY > 270) {
        pdf.addPage();
        attachY = 20;
      }
      
      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      pdf.text(`📄 PDF Document: ${item.name}`, 25, attachY);
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text("(PDF files cannot be embedded - please attach separately)", 25, attachY + 5);
      pdf.setTextColor(0, 0, 0);
      attachY += 15;
    }
  }
}
