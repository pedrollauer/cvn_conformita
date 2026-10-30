#define DEBUG
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swcommands;
using SolidWorks.Interop.swconst;
using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;

namespace Interface
{
    public class SW
    {
        public SldWorks swApp;
        public IModelDoc2 model;
        public EquationMgr eMgr;
        public int W_index = 0;

        private int docType(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            switch (ext)
            {

                case ".sldprt":
                    return (int)swDocumentTypes_e.swDocPART;
                    break;
                case ".sldasm":
                    return (int)swDocumentTypes_e.swDocASSEMBLY;
                    break;
                case ".slddrw":
                    return (int)swDocumentTypes_e.swDocDRAWING;
                    break;
                default:
                    return -1;

            }

        }

        public bool temEq(string variable)
        {
            return false;
        }

        //TODO: DELETE
        public void changeEquation(string value)
        {
        }

        private int GetDocumentType(string filePath)
        {
            string ext = Path.GetExtension(filePath).ToLower();
            switch (ext)
            {
                case ".sldprt":
                    return (int)swDocumentTypes_e.swDocPART;
                case ".sldasm":
                    return (int)swDocumentTypes_e.swDocASSEMBLY;
                case ".slddrw":
                    return (int)swDocumentTypes_e.swDocDRAWING;
                default:
                    return -1;
            }
        }


        public void GetCameraOrViewportPosition()
        {
            ModelDoc2 swModel = (ModelDoc2)this.swApp.ActiveDoc;
            if (swModel == null) return;

            ModelView swView = (ModelView)swModel.ActiveView;
            if (swView != null)
            {
                MathVector translation = (MathVector)swView.Translation3;
                double[] transData = (double[])translation.ArrayData;

                double scale = swView.Scale2;

                MathTransform transform = (MathTransform)swView.Orientation3;
                double[] matrixData = (double[])transform.ArrayData;

                Console.WriteLine("--- STANDARD VIEWPORT ---");
                Console.WriteLine($"Pan Translation: X: {transData[0]}, Y: {transData[1]}, Z: {transData[2]}");
                Console.WriteLine($"Zoom Scale:      {scale}");
                Console.WriteLine($"Matrix Element 0 (Rot X): {matrixData[0]}");

            }
        }
        public double pixelsMeterConvertionFactor(ModelView swView, double pixelDistance, double dpi = 96.0)
        {

            if (swView == null) return 0;

            double scale = swView.Scale2;

            double pixelsPerMeter = dpi / 0.0254;

            double realWorldMeters = pixelDistance / (scale * pixelsPerMeter);

            return realWorldMeters;
        }

        public double GenerateSectionCutThumbnail(string sourceFilePath, string outputBmpPath, int width = 800, int height = 600, int viewType = 7)
        {
            if (!File.Exists(sourceFilePath))
            {
                throw new FileNotFoundException("SOLIDWORKS file not found.", sourceFilePath);
            }

            int docType = GetDocumentType(sourceFilePath);

            if (docType < 0)
            {
                throw new ArgumentException("Unsupported file extension. Please provide a .sldprt or .sldasm file.");
            }

            int errors = 0;
            int warnings = 0;

            // NOTE: Removed ViewOnly and LDR_EditAssembly flags so SOLIDWORKS loads full geometry needed for section cutting
            int options = (int)swOpenDocOptions_e.swOpenDocOptions_Silent |
                          (int)swOpenDocOptions_e.swOpenDocOptions_ReadOnly;

            this.model = swApp.OpenDoc6(sourceFilePath, docType, options, "", ref errors, ref warnings);

            if (this.model == null)
            {
                Console.WriteLine($"Failed to open document. Error Code: {errors}");
                return 0.0f;
            }

            try
            {
                // 1. Hide Annotations & Types
                this.model.Extension.SetUserPreferenceToggle(
                    (int)swUserPreferenceToggle_e.swViewDisplayHideAllTypes,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    true);

                this.model.Extension.SetUserPreferenceToggle(
                    (int)swUserPreferenceToggle_e.swDisplayAllAnnotations,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    false);

                // 2. Set Named View & Shaded Mode
                this.model.ShowNamedView2("", viewType);

                IModelView activeView = (IModelView)this.model.ActiveView;
                if (activeView != null)
                {
                    activeView.DisplayMode = (int)swViewDisplayMode_e.swViewDisplayMode_ShadedWithEdges;
                }

                // 3. APPLY SECTION CUT (CUT VIEW)
                ApplySectionCut(this.model);

                // 4. Zoom to fit and redraw
                this.model.ViewZoomtofit();
                this.model.GraphicsRedraw2();

                // 5. Save BMP
                this.model.SaveBMP(outputBmpPath, 0, 0);

                // 6. REMOVE SECTION CUT
                this.model.ModelViewManager.RemoveSectionView();

                // Redraw to reflect the removed section cut in the graphics area
                this.model.GraphicsRedraw2();

                return activeView != null ? activeView.Scale2 : 0.0;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error generating thumbnail: {ex.Message}");
                return 0.0;
            }
        }

        /// <summary>
        /// Finds the first default reference plane and applies a 50% center section cut.
        /// </summary>
        private void ApplySectionCut(IModelDoc2 model)
        {
            // Find the first reference plane (Front Plane) in a language-independent way
            Feature feat = (Feature)model.FirstFeature();
            Feature planeFeature = null;

            while (feat != null)
            {
                if (feat.GetTypeName2() == "RefPlane")
                {
                    planeFeature = feat;
                    break; // First plane is typically Front Plane
                }
                feat = (Feature)feat.GetNextFeature();
            }

            if (planeFeature == null)
            {
                Console.WriteLine("Warning: No reference plane found for section cut.");
                return;
            }

            // Create Section View Data
            ModelViewManager mvm = model.ModelViewManager;
            SectionViewData svd = mvm.CreateSectionViewData();

            svd.FirstPlane = planeFeature;
            svd.FirstOffset = 0.0; // Cut directly through the center plane
            svd.FirstReverseDirection = false;

            // Optional: Render caps on the cut faces
            svd.ShowSectionCap = true;
            svd.KeepCapColor = true;

            // Activate the section view
            bool status = mvm.CreateSectionView(svd);

            if (!status)
            {
                Console.WriteLine("Warning: Failed to create section view.");
            }
        }
        public double GenerateIsometricThumbnail(string sourceFilePath, string outputBmpPath, int width = 800, int height = 600, int viewType = 7)
        {


            if (!File.Exists(sourceFilePath))
            {
                throw new FileNotFoundException("SOLIDWORKS file not found.", sourceFilePath);
            }

            int docType = GetDocumentType(sourceFilePath);

            if (docType < 0)
            {
                throw new ArgumentException("Unsupported file extension. Please provide a .sldprt or .sldasm file.");
            }

            int errors = 0;
            int warnings = 0;

            int options = (int)swOpenDocOptions_e.swOpenDocOptions_Silent |
                          (int)swOpenDocOptions_e.swOpenDocOptions_ReadOnly |
                          (int)swOpenDocOptions_e.swOpenDocOptions_ViewOnly |
                          (int)swOpenDocOptions_e.swOpenDocOptions_LDR_EditAssembly;



            this.model = swApp.OpenDoc6(sourceFilePath, docType, options, "", ref errors, ref warnings);

            if (this.model == null)
            {
                Console.WriteLine($"Failed to open document. Error Code: {errors}");
                return 0.0f;
            }

            try
            {
                this.model.Extension.SetUserPreferenceToggle(
                    (int)swUserPreferenceToggle_e.swViewDisplayHideAllTypes,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    true);

                this.model.Extension.SetUserPreferenceToggle(
                    (int)swUserPreferenceToggle_e.swDisplayAllAnnotations,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    false);

                bool annotationsVisible = swApp.GetUserPreferenceToggle((int)swUserPreferenceToggle_e.swDisplayAllAnnotations);
                if (annotationsVisible)
                {
                    this.swApp.RunCommand((int)swCommands_e.swCommands_Annotations, "");
                }

                this.model.ShowNamedView2("", viewType);
                this.model.ViewZoomtofit();

                IModelView activeView = (IModelView)this.model.ActiveView;
                if (activeView != null)
                {
                    activeView.DisplayMode = (int)swViewDisplayMode_e.swViewDisplayMode_ShadedWithEdges;
                }

                this.model.ShowNamedView2("", viewType);

                this.model.ViewZoomtofit();

                this.model.GraphicsRedraw2();


                this.model.SaveBMP(outputBmpPath, 0, 0);

                return activeView.Scale2;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error generating thumbnail: {ex.Message}");
                return 0.0f;
            }
        }


        // Puts the active assembly into a drawing and saves it as a DWG file on the desktop
        public void GenAssemblyDrawing()
        {
            var swApp = this.swApp;
            if (swApp == null) return;

            ModelDoc2 swModel = (ModelDoc2)this.model;

            if (swModel == null || swModel.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                swApp.SendMsgToUser("Please open an Assembly document first.");
                return;
            }

            string asmPath = swModel.GetPathName();
            if (string.IsNullOrEmpty(asmPath))
            {
                swApp.SendMsgToUser("Please save the assembly before running this script.");
                return;
            }


            string drawingTemplate = swApp.GetUserPreferenceStringValue((int)swUserPreferenceStringValue_e.swDefaultTemplateDrawing);
            if (string.IsNullOrEmpty(drawingTemplate))
            {
                swApp.SendMsgToUser("No default drawing template found.");
                return;
            }

            ModelDoc2 swDrawingDoc = (ModelDoc2)swApp.NewDocument(drawingTemplate, (int)swDwgPaperSizes_e.swDwgPaperA3size, 0, 0);
            if (swDrawingDoc == null) return;

            DrawingDoc swDrawing = (DrawingDoc)swDrawingDoc;

            bool viewsCreated = swDrawing.Create1stAngleViews2(Path.GetFileNameWithoutExtension(asmPath));

            if (!viewsCreated)
            {
                swApp.SendMsgToUser("Failed to create drawing views.");
                return;
            }

            swDrawingDoc.ClearSelection2(true);

            double noteX = 0.05;
            double noteY = 0.05;


            string dirPath = Path.GetDirectoryName(asmPath);
            string fileName = Path.GetFileNameWithoutExtension(asmPath);
            string pngPath = Path.Combine("C:\\Users\\pedro.lauer\\Desktop\\VENDAS\\", fileName + "_2D.dwg");

            Console.WriteLine(pngPath);
            int errors = 0;
            int warnings = 0;

            swDrawingDoc.EditRebuild3();
            swDrawingDoc.ViewZoomtofit2();

            bool saveSuccess = swDrawingDoc.Extension.SaveAs3(
                pngPath,
                (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                null,
                null,
                ref errors,
                ref warnings
            );

            if (saveSuccess)
            {
                swApp.SendMsgToUser($"Successfully exported PNG to:\n{pngPath}");
            }
            else
            {
                swApp.SendMsgToUser($"Failed to export PNG. Error code: {errors}");
            }

            this.fechar();
        }

        public double[] GetAccurateAssemblyBoundingBox()
        {
            this.model = (IModelDoc2)this.swApp.ActiveDoc;
            if (this.model.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                Console.WriteLine("The active document is not an assembly.");
                return null;
            }

            AssemblyDoc swAssy = (AssemblyDoc)this.model;

            object[] components = (object[])swAssy.GetComponents(false);
            if (components == null || components.Length == 0) return null;

            double minX = double.MaxValue, minY = double.MaxValue, minZ = double.MaxValue;
            double maxX = double.MinValue, maxY = double.MinValue, maxZ = double.MinValue;
            bool hasValidGeometry = false;

            foreach (Component2 swComp in components)
            {
                if (swComp.GetSuppression() == (int)swComponentSuppressionState_e.swComponentSuppressed)
                    continue;

                if (swComp.IsHidden(false))
                    continue;

                object boxObj = swComp.GetBox(true, true);

                if (boxObj != null)
                {
                    double[] box = (double[])boxObj;

                    if (box[0] < minX) minX = box[0];
                    if (box[1] < minY) minY = box[1];
                    if (box[2] < minZ) minZ = box[2];
                    if (box[3] > maxX) maxX = box[3];
                    if (box[4] > maxY) maxY = box[4];
                    if (box[5] > maxZ) maxZ = box[5];

                    hasValidGeometry = true;
                }
            }

            if (!hasValidGeometry) return null;

            double width = maxX - minX;
            double height = maxY - minY;
            double depth = maxZ - minZ;

            Console.WriteLine($"Width (X): {width * 1000} mm");
            Console.WriteLine($"Height (Y): {height * 1000} mm");
            Console.WriteLine($"Depth (Z): {depth * 1000} mm");

            return new double[] { width, height, depth };
        }

        public double[] GetAssemblyBoundingBox()
        {
            this.model = (IModelDoc2)this.swApp.ActiveDoc;
            if (this.model.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                Console.WriteLine("The active document is not an assembly.");
                return null;
            }

            AssemblyDoc swAssy = (AssemblyDoc)this.model;

            object boxObj = swAssy.GetBox(0);

            if (boxObj != null)
            {
                double[] box = (double[])boxObj;

                // Extract Min and Max points (Values are in meters)
                double minX = box[0];
                double minY = box[1];
                double minZ = box[2];

                double maxX = box[3];
                double maxY = box[4];
                double maxZ = box[5];

                // Calculate dimensions
                // Come sapere qual'è la dimenzione di lavoro?
                double width = maxX - minX;
                double height = maxY - minY;
                double depth = maxZ - minZ;

                Console.WriteLine($"Width (X): {width * 1000} mm");
                Console.WriteLine($"Height (Y): {height * 1000} mm");
                Console.WriteLine($"Depth (Z): {depth * 1000} mm");

                double[] returnMe = { width, height, depth };
                return returnMe;
            }

            return null;
        }

        public void fechar()
        {
            this.swApp.CloseDoc(this.model.GetTitle());
        }

        public void PackAndGoAssembly(string assemblyPath, string destinationFolder)
        {
            // 1. Open the assembly
            int errors = 0;
            int warnings = 0;

            // It is recommended to open the doc to get the Extension object
            ModelDoc2 swModel = swApp.OpenDoc6(assemblyPath, (int)swDocumentTypes_e.swDocASSEMBLY,
                                (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", ref errors, ref warnings);

            if (swModel == null)
            {
                Console.WriteLine("Failed to open assembly. Error: " + errors);
                return;
            }

            ModelDocExtension swModelDocExt = swModel.Extension;

            // 2. Get the Pack and Go object
            PackAndGo swPackAndGo = swModelDocExt.GetPackAndGo();

            // 3. Configure Pack and Go properties
            swPackAndGo.IncludeDrawings = true;
            swPackAndGo.IncludeSimulationResults = false;
            swPackAndGo.IncludeToolboxComponents = true;
            swPackAndGo.FlattenToSingleFolder = true; // Keeps everything in one folder

            // 4. Set the destination path
            swPackAndGo.SetSaveToName(true, destinationFolder);

            // 5. Execute the Pack and Go
            // statuses will contain an array of ints representing the success of each file
            object statuses = swModelDocExt.SavePackAndGo(swPackAndGo);

            // 6. Close the document and clean up
            swApp.CloseDoc(assemblyPath);

            Console.WriteLine("Pack and Go completed to: " + destinationFolder);
        }

        public static void WriteEqFile(int value, string directoryPath, string fileName)
        {
            try
            {
                // Ensure the directory exists
                if (!Directory.Exists(directoryPath))
                    Directory.CreateDirectory(directoryPath);

                // Define the file path
                string filePath = Path.Combine(directoryPath, fileName);

                // Write the value to the file
                string content = $"W={value}";
                File.WriteAllText(filePath, content);

                Console.WriteLine($"File successfully written to: {filePath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error writing file: {ex.Message}");
            }
        }

        public SW()
        {
            swApp = new SldWorks();
            swApp.Visible = true;
            model = (IModelDoc2)swApp.ActiveDoc;
        }

        public int openASM(string path, bool readOnly)
        {
            if (swApp == null)
                swApp = new SldWorks();

            int options = (int)swOpenDocOptions_e.swOpenDocOptions_LoadModel
                        | (readOnly ? (int)swOpenDocOptions_e.swOpenDocOptions_ReadOnly : 0);

            int err = 0, warn = 0;
            this.model = swApp.OpenDoc6(
                path,
                (int)swDocumentTypes_e.swDocASSEMBLY,
                options,
                "",
                ref err, ref warn);

            // Optional: throw if failed
            if (model == null) throw new Exception($"OpenDoc6 failed: {DecodeLoadError(err)}");

            return err; // 0 means OK
        }

        // Handy to see what went wrong (err is a bitmask)
        private static string DecodeLoadError(int err)
        {
            var e = (swFileLoadError_e)err;
            return e.ToString();
        }

        public bool setEquation(string leftSide, string rightSide, string config = null)
        {
            if (this.model == null)
                this.model = (IModelDoc2)this.swApp.ActiveDoc;

            var model = this.model;
            var eMgr = model.GetEquationMgr();

            int numEqs = eMgr.GetCount();

            if (numEqs == 0)
                return true;

            eMgr.LinkToFile = false;
            eMgr.FilePath = "";

            string eqNew = "";
            int n = 0;

            for (int i = 0; i < numEqs; i++)
            {
                string[] eSides = eMgr.Equation[i].Split("=");
                if (eSides[0].Contains(leftSide))
                {
                    string eqOR = eMgr.Equation[i];
                    eqNew = eMgr.Equation[i].Replace(eSides[1], rightSide);
                    if (config == null)
                        eMgr.Equation[i] = eqNew;
                    else
                        eMgr.SetEquationAndConfigurationOption(i, eqNew, (int)swInConfigurationOpts_e.swSpecifyConfiguration, new string[] { config });

                    n = i;
                    break;
                }
            }

            if (eqNew.Equals(eMgr.Equation[n]))
                return true;
            return false;
        }
        // GetTypeName2() for a Move/Copy Body feature - confirmed 2026-10-30 against a real part
        // (via the "freezebar" CLI test command) that brings in external geometry through
        // Insert > Part and then repositions/copies it with a Move/Copy Body feature. The
        // earlier guess ("DerivedPart"/"SheetMetal") was wrong - this one's from an actual
        // feature list, not inferred from the interop DLL's interface names.
        private const string MoveCopyBodyFeatureTypeName = "MoveCopyBody";

        /// <summary>
        /// Walks the feature tree from the first feature looking for a MoveCopyBody feature. If
        /// found, returns the feature immediately BEFORE it - confirmed test case: "...-731620159209"
        /// (Stock) immediately precedes "Corpo-Mover/Copiar2" (MoveCopyBody), and the freeze bar
        /// needs to stop before the Stock feature, not before the MoveCopyBody itself. Returns
        /// null if there's no MoveCopyBody feature, or if one exists but is the very first
        /// feature in the tree (nothing to stop before).
        /// </summary>
        public Feature FindFreezeBarBoundaryFeature()
        {
            if (this.model == null)
            {
                return null;
            }

            Feature feat = (Feature)this.model.FirstFeature();
            Feature previous = null;
            while (feat != null)
            {
                if (feat.GetTypeName2() == MoveCopyBodyFeatureTypeName)
                {
                    return previous;
                }
                previous = feat;
                feat = (Feature)feat.GetNextFeature();
            }
            return null;
        }

        /// <summary>
        /// Moves the freeze bar to the very end of the feature tree, UNLESS the tree contains a
        /// Move/Copy Body feature - in that case the freeze bar stops just before whatever
        /// feature precedes it instead, so the Move/Copy Body step (and the externally-inserted
        /// geometry it acts on) never ends up frozen. Returns false if there's no active model or
        /// the EditFreeze2 call fails.
        /// </summary>
        public bool MoveFreezeBar()
        {
            if (this.model == null)
            {
                return false;
            }

            FeatureManager swFeatMgr = this.model.FeatureManager;
            Feature boundary = FindFreezeBarBoundaryFeature();

            int status;
            if (boundary != null)
            {
                Console.WriteLine($"MoveFreezeBar: MoveCopyBody feature found - stopping before \"{boundary.Name}\".");
                status = swFeatMgr.EditFreeze2(
                    (int)swMoveFreezeBarTo_e.swMoveFreezeBarToBeforeFeature,
                    boundary.Name,
                    true,
                    true
                );
            }
            else
            {
                status = swFeatMgr.EditFreeze2(
                    (int)swMoveFreezeBarTo_e.swMoveFreezeBarToEnd,
                    "",
                    true,
                    true
                );
            }

            return status == 0;
        }

        /// <summary>
        /// Opens a part or assembly for inspection only - no drafting-standard/image-quality
        /// changes, no save. Used by the "freezebar" CLI test command so a dry run can never
        /// touch a real file's content.
        /// </summary>
        public bool OpenForInspection(string path)
        {
            int type = GetDocumentType(path);
            if (type == -1)
            {
                Console.WriteLine($"OpenForInspection: unsupported file type for {path}");
                return false;
            }

            int err = 0, warn = 0;
            this.model = this.swApp.OpenDoc6(
                path.Trim(),
                type,
                (int)(swOpenDocOptions_e.swOpenDocOptions_Silent | swOpenDocOptions_e.swOpenDocOptions_LoadModel),
                "",
                ref err,
                ref warn
            );
            return this.model != null;
        }

        /// <summary>
        /// Every top-level feature's name and GetTypeName2(), in tree order - diagnostic helper
        /// for the "freezebar" CLI test command to verify MoveCopyBodyFeatureTypeName against a
        /// real file before trusting MoveFreezeBar's detection on anything that matters.
        /// </summary>
        public List<(string Name, string TypeName)> ListFeatures()
        {
            List<(string, string)> result = new List<(string, string)>();
            if (this.model == null)
            {
                return result;
            }

            Feature feat = (Feature)this.model.FirstFeature();
            while (feat != null)
            {
                result.Add((feat.Name, feat.GetTypeName2()));
                feat = (Feature)feat.GetNextFeature();
            }
            return result;
        }

        /// <summary>
        /// Closes the currently open document without saving - used by the "freezebar" CLI test
        /// command so a dry run can never persist anything to a real file.
        /// </summary>
        public void CloseWithoutSaving()
        {
            if (this.model == null)
            {
                return;
            }
            string title = this.model.GetTitle();
            this.swApp.CloseDoc(title);
            this.model = null;
        }

        public bool MoveRollbackBarToEnd()
        {
            if (this.model == null)
            {
                return false;
            }

            FeatureManager swFeatMgr = this.model.FeatureManager;

            bool success = swFeatMgr.EditRollback((int)swMoveRollbackBarTo_e.swMoveRollbackBarToEnd, "");

            return success;
        }

        public bool SetImageQuality()
        {
            if (this.model == null)
            {
                return false;
            }

            int docType = this.model.GetType();
            if (docType != (int)swDocumentTypes_e.swDocPART && docType != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                return false;
            }

            ModelDocExtension swModelExt = this.model.Extension;
            bool needsUpdate = false;

            double targetDeviation = 0.41666667 / 1000.0;

            double currentShadedDeviation = swModelExt.GetUserPreferenceDouble(
                (int)swUserPreferenceDoubleValue_e.swImageQualityShadedDeviation,
                (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified);

            if (currentShadedDeviation < (targetDeviation - 0.000001))
            {
                swModelExt.SetUserPreferenceDouble(
                    (int)swUserPreferenceDoubleValue_e.swImageQualityShadedDeviation,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    targetDeviation);

                if (docType == (int)swDocumentTypes_e.swDocASSEMBLY)
                {
                    swModelExt.SetUserPreferenceToggle(
                        (int)swUserPreferenceToggle_e.swImageQualityApplyToAllReferencedPartDoc,
                        (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                        false);
                }
                needsUpdate = true;
            }

            int currentWireframeDeviation = swModelExt.GetUserPreferenceInteger(
                (int)swUserPreferenceIntegerValue_e.swImageQualityWireframe,
                (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified);

            if (currentWireframeDeviation > 1)
            {
                swModelExt.SetUserPreferenceInteger(
                    (int)swUserPreferenceIntegerValue_e.swImageQualityWireframe,
                    (int)swUserPreferenceOption_e.swDetailingNoOptionSpecified,
                    1);
                needsUpdate = true;
            }

            return needsUpdate;
        }

        public void preparar(int size)
        {
            var sw = this.swApp;
            sw.DocumentVisible(false, (int)swDocumentTypes_e.swDocPART);
            sw.DocumentVisible(false, (int)swDocumentTypes_e.swDocASSEMBLY);
            sw.DocumentVisible(false, (int)swDocumentTypes_e.swDocDRAWING);

            int err = 0, warn = 0;
            int count = 0;
            string[] asm = Directory.GetFiles("C:\\Users\\pedro.lauer\\Documents\\Stash\\SDR_PDM_DST4", "*.sldasm");
            string[] parts = Directory.GetFiles("C:\\Users\\pedro.lauer\\Documents\\Stash\\SDR_PDM_DST4", "*.sldprt")
                          .Where(file => !Path.GetFileName(file).StartsWith("~$"))
                          .ToArray();

            int total = parts.Length;

            foreach (var file in parts)
            {
                string path = file;
                if (string.IsNullOrWhiteSpace(path)) continue;
                int docType = path.ToLower().EndsWith(".sldprt") ? 1 : path.ToLower().EndsWith(".sldasm") ? 2 : path.ToLower().EndsWith(".slddrw") ? 3 : 0;
                try
                {

                    var doc = this.swApp.OpenDoc6(path.Trim(), docType,
                        (int)(0),
                        "", ref err, ref warn);

                    doc.ForceRebuild3(false);
                    doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref err, ref warn);
                    sw.CloseDoc(doc.GetTitle());
                    Console.WriteLine(count + "|" + total);
                }
                catch (Exception e)
                {
                    Console.WriteLine("Erro ao abrir: " + path + " err: " + err);
                    continue;
                }
            }

            DirectoryInfo di = new DirectoryInfo("C:\\Users\\pedro.lauer\\Documents\\Stash\\SDR_PDM_DST");

            var sortedFiles = di.GetFiles("*.sldasm")
                    .Where(f => !f.Name.StartsWith("~$"))
                    .OrderBy(f => f.Length)
                    .ToList();

            foreach (var file in sortedFiles)
            {
                string path = file.FullName;
                if (string.IsNullOrWhiteSpace(path)) continue;
                int docType = path.ToLower().EndsWith(".sldprt") ? 1 : path.ToLower().EndsWith(".sldasm") ? 2 : path.ToLower().EndsWith(".slddrw") ? 3 : 0;
                try
                {

                    var doc = this.swApp.OpenDoc6(path.Trim(), docType,
                        (int)(0),
                        "", ref err, ref warn);

                    doc.ForceRebuild3(false);
                    doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref err, ref warn);
                    sw.CloseDoc(doc.GetTitle());
                    Console.WriteLine(count + "|" + total);
                }
                catch (Exception e)
                {
                    Console.WriteLine("Erro ao abrir: " + path + " err: " + err);
                    continue;
                }
            }
        }




        public void SetDraftingStandard()
        {
            string standardFilePath = "C:\\_CavannaPDM\\Sistema\\SOLIDWORKS\\Standard Disegno\\ISO-MODIFICATO 0110509 arial3.7semiridotta Draw.sldstd";
            if (this.model == null)
                return;

            if (this.model != null)
            {

                bool success = this.model.Extension.LoadDraftingStandard(standardFilePath);

                if (!success)
                {
                    System.Diagnostics.Debug.WriteLine($"Failed to load drafting standard from: {standardFilePath}");
                }
            }
        }


        public bool Conform(string path)
        {
            var sw = this.swApp;

            int err = 0, warn = 0;

            if (string.IsNullOrWhiteSpace(path))
                return false;

            int docType = path.ToLower().EndsWith(".sldprt") ? 1 : path.ToLower().EndsWith(".sldasm") ? 2 : path.ToLower().EndsWith(".slddrw") ? 3 : 0;

            try
            {
                this.model = sw.OpenDoc6(path.Trim(), docType,
                    (int)(swOpenDocOptions_e.swOpenDocOptions_Silent | swOpenDocOptions_e.swOpenDocOptions_LoadModel),
                    "", ref err, ref warn);

                this.MoveFreezeBar();
                this.MoveRollbackBarToEnd();
                this.SetDraftingStandard();
                this.SetImageQuality();

                if (this.model == null) return false;
                Console.WriteLine("Reconstruindo: " + this.model.GetTitle());

                this.model.ForceRebuild3(false);
                bool result = this.model.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref err, ref warn);
                sw.CloseDoc(this.model.GetTitle());
                return result;
            }
            catch (Exception e)
            {
                Console.WriteLine("Erro ao abrir: " + path + " err: " + err);
                return false;
            }
        }

        public void abreFecha(string path)
        {
            var sw = this.swApp;

            int err = 0, warn = 0;

            if (string.IsNullOrWhiteSpace(path))
                return;

            int docType = path.ToLower().EndsWith(".sldprt") ? 1 : path.ToLower().EndsWith(".sldasm") ? 2 : path.ToLower().EndsWith(".slddrw") ? 3 : 0;

            try
            {
                var doc = sw.OpenDoc6(path.Trim(), docType,
                    (int)(swOpenDocOptions_e.swOpenDocOptions_Silent | swOpenDocOptions_e.swOpenDocOptions_LoadModel),
                    "", ref err, ref warn);


                if (doc == null) return;
                Console.WriteLine("Reconstruindo: " + doc.GetTitle());

                doc.ForceRebuild3(false);
                doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref err, ref warn);
                sw.CloseDoc(doc.GetTitle());
            }
            catch (Exception e)
            {
                Console.WriteLine("Erro ao abrir: " + path + " err: " + err);
            }
        }

        public string findCFGByParameter(string parameter, Component2 swComp)
        {
            string[] configsInmodel = (string[])swComp.GetConfigurationNames();
            string config = null;
            foreach (string c in configsInmodel)
            {
                if (c.ToLower().Contains(parameter.ToLower()))
                {
                    config = c;
                }
            }

            return config;

        }

        public string[] getConfigNames()
        {
            string[] configs = (string[])this.model.GetConfigurationNames();
            return configs;
        }

        public void setConfig(string component, string config)
        {
            if (this.model == null)
                this.model = (ModelDoc2)this.swApp.ActiveDoc;

            if (this.model == null || this.model.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
            {
                Console.WriteLine("O documento ativo não é uma montagem.");
                return;
            }

            AssemblyDoc swAssy = (AssemblyDoc)this.model;

            // Obtém todos os componentes da montagem (nível superior)
            object[] components = (object[])swAssy.GetComponents(false);

            if (components != null)
            {
                foreach (object compObj in components)
                {
                    Component2 swComp = (Component2)compObj;
                    int dashIndex = swComp.Name2.IndexOf('-');
                    string cleanName = swComp.Name2[0..dashIndex];

                    if (cleanName.Equals(component))
                    {
                        swComp.ReferencedConfiguration = findCFGByParameter(config, swComp);

                        this.model.EditRebuild3();
                        Console.WriteLine($"Sucesso: Componente '{component}' alterado para '{config}'.");
                        return;
                    }
                }
            }

            Console.WriteLine($"Erro: Componente '{component}' não encontrado na montagem.");
        }
        //TODO: DELETE ME
        public void OpenRebuildCloseAll2(string listPath, int size)
        {
        }

        public string GetSelectedFilePath()
        {
            // Get the active document (part, assembly, or drawing)

            if (model == null)
            {
                this.model = (ModelDoc2)swApp.ActiveDoc;
                Console.WriteLine("No active document.");
                return null;
            }
            ModelDoc2 swModel = (ModelDoc2)model;
            // Get the current selection manager
            SelectionMgr selMgr = (SelectionMgr)swModel.SelectionManager;
            if (selMgr == null)
            {
                Console.WriteLine("Selection manager not available.");
                return null;
            }

            // Check if anything is selected
            if (selMgr.GetSelectedObjectCount2(-1) < 1)
            {
                Console.WriteLine("No item selected.");
                return null;
            }

            // Get the first selected object
            object selectedObject = selMgr.GetSelectedObject6(1, -1);
            if (selectedObject == null)
            {
                Console.WriteLine("Selection invalid.");
                return null;
            }

            // Try to resolve it as a Component (assembly context)
            if (selectedObject is Component2 comp)
            {
                string path = comp.GetPathName();
                Console.WriteLine("Component path: " + path);
                return path;
            }

            // Try to resolve it as a ModelDoc2 (direct file open)
            if (selectedObject is ModelDoc2 selModel)
            {
                string path = selModel.GetPathName();
                Console.WriteLine("Model path: " + path);
                return path;
            }

            // Handle other cases (faces, edges, etc.)
            ModelDoc2 ownerDoc = this.model as ModelDoc2;//(ModelDoc2)selMgr.GetSelectedObjectDoc2(1);
            if (ownerDoc != null)
            {
                string path = ownerDoc.GetPathName();
                Console.WriteLine("Owner model path: " + path);
                return path;
            }

            Console.WriteLine("No valid file path found.");
            return null;
        }

        public int openPart(string path)
        {
            int err = 0;
            int warn = 0;
            this.model = this.swApp.OpenDoc6(path, 1, 16, null, ref err, ref warn);

            return err;
        }
        public List<String> listWComponents()
        {
            List<String> components = new List<String>();
            string folder = "C:\\Users\\pedro.lauer\\Documents\\Stash\\SDR2";

            string[] dirs = Directory.GetFiles(folder);



            foreach (string file in dirs)
            {
                if (isW(file))
                {
                    components.Add(file);
                    log("log.txt", file);
                    Console.WriteLine(file);
                }
            }

            return components;
        }

        public string[] getMaterialDescription()
        {
            if (this.model.GetType() == (int)swDocumentTypes_e.swDocPART)
            {
                PartDoc swPart = (PartDoc)this.model;

                string configName = this.model.ConfigurationManager.ActiveConfiguration.Name;

                string databaseName = "";
                string materialName = swPart.GetMaterialPropertyName2(configName, out databaseName);

                if (!string.IsNullOrEmpty(materialName))
                {
                    Console.WriteLine($"Material: {materialName}");
                    Console.WriteLine($"Biblioteca: {databaseName}");
                    return [materialName, databaseName];
                }
                return ["NULL", "NULL"];
            }
            else
            {
                return ["DIVERSOS", "DIVERSOS"];
            }
        }

        public string GetCustomPropertyValue(string propertyName)
        {
            string valOut = "";
            string resValOut = "";
            bool wasResolved;
            bool linkToProp;
            int status;
            var swModel = this.model as ModelDoc2;

            string activeConfig = swModel.ConfigurationManager.ActiveConfiguration.Name;
            CustomPropertyManager configPropMgr = swModel.Extension.get_CustomPropertyManager(activeConfig);

            status = configPropMgr.Get6(propertyName, false, out valOut, out resValOut, out wasResolved, out linkToProp);

            if (status == (int)swCustomInfoGetResult_e.swCustomInfoGetResult_ResolvedValue)
            {
                return resValOut;
            }


            CustomPropertyManager customPropMgr = swModel.Extension.get_CustomPropertyManager("");
            status = customPropMgr.Get6(propertyName, false, out valOut, out resValOut, out wasResolved, out linkToProp);

            if (status == (int)swCustomInfoGetResult_e.swCustomInfoGetResult_ResolvedValue)
            {
                return resValOut;
            }

            return "N/A";
        }

        public void log(string fileName, string data)
        {

            using (StreamWriter sw = File.AppendText(fileName))
            {
                sw.WriteLine(data);
            }

        }

        public void getEqMan()
        {
            eMgr = model.GetEquationMgr();
        }

        public bool isW()
        {
            return true;
        }

        //Returns true if the part or assembly has an equation of the type W = X
        public bool isW(string fileName)
        {
            return true;
        }

        public string getName(string name)
        {
            int end = name.LastIndexOf('-');

            if (end < 0)
            {
                return name;
            }

            name = name[0..end];

            return name;
        }

        public string[] splitPath(string name)
        {
            string[] rawSplit = name.Split('/');

            for (int i = 0; i < rawSplit.Length; i++)
            {
                rawSplit[i] = this.getName(rawSplit[i]);
            }

            return rawSplit;
        }
        public string getName(Component2 c)
        {
            string name = c.Name;
            int end = name.LastIndexOf('-');

            if (end == -1)
            {
                return c.Name;
            }

            name = name[0..end];

            return name;
        }


        // -------- internals --------
        public bool selectFirstTop(string fileBase, bool append = false, int mark = 0, bool unsuppress = true)
        {
            var cfg = model.ConfigurationManager?.ActiveConfiguration;
            var root = cfg?.GetRootComponent3(true) as IComponent2;
            if (root == null) return false;

            // only top-level children of the active config
            var kids = ((object[])root.GetChildren() ?? Array.Empty<object>()).Cast<IComponent2>();

            string wanted = NormalizeBase(fileBase);

            foreach (var c in kids)
            {
                string path = SafePath(c);
                if (string.IsNullOrEmpty(path)) continue;

                string curBase = NormalizeBase(Path.GetFileNameWithoutExtension(path));
                if (string.Equals(curBase, wanted, StringComparison.OrdinalIgnoreCase))
                {

                    return c.Select4(append, null, false);
                }
            }
            return false; // not found among top-level
        }

        /// Select ALL matching top-level occurrences (returns count selected).
        public static int SelectAllTop(IAssemblyDoc asm, string fileBase, int mark = 0, bool unsuppress = true)
        {
            var model = (IModelDoc2)asm;
            var cfg = model.ConfigurationManager?.ActiveConfiguration;
            var root = cfg?.GetRootComponent3(true) as IComponent2;
            if (root == null) return 0;

            var kids = ((object[])root.GetChildren() ?? Array.Empty<object>()).Cast<IComponent2>();
            string wanted = NormalizeBase(fileBase);

            int n = 0;
            bool append = false;
            foreach (var c in kids)
            {
                string path = SafePath(c);
                if (string.IsNullOrEmpty(path)) continue;

                string curBase = NormalizeBase(Path.GetFileNameWithoutExtension(path));
                if (!string.Equals(curBase, wanted, StringComparison.OrdinalIgnoreCase)) continue;


                if (c.Select4(append, null, false)) { n++; append = true; }
            }
            return n;
        }

        // -------- helpers --------
        private static string SafePath(IComponent2 c) { try { return c.GetPathName() ?? ""; } catch { return ""; } }

        // trims virtual suffix like "PartX^AsmY" -> "PartX"
        private static string NormalizeBase(string baseNoExt)
        {
            if (string.IsNullOrEmpty(baseNoExt)) return "";
            int caret = baseNoExt.IndexOf('^');
            return (caret > 0) ? baseNoExt[..caret] : baseNoExt;
        }

        // -------- helpers --------

        private static IComponent2? FindByPath(IAssemblyDoc asm, string path)
        {
            var model = (IModelDoc2)asm;
            var cfg = model.ConfigurationManager?.ActiveConfiguration;
            var root = cfg?.GetRootComponent3(true) as IComponent2;
            if (root == null) return null;

            var tokens = path.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
            IComponent2 current = root;
            foreach (var name in tokens)
            {
                var kids = (object[])current.GetChildren() ?? Array.Empty<object>();
                current = kids.Cast<IComponent2>().FirstOrDefault(c => string.Equals(c.Name2, name, StringComparison.OrdinalIgnoreCase));
                if (current == null) return null;
            }
            return current;
        }

        public bool duplicarArquivo(string newFileName, string oldFileName)
        {
            if (newFileName == null || oldFileName == null)
                return false;
            File.Copy(oldFileName, newFileName);
            return File.Exists(newFileName);
        }

        public bool openResolvedASM(string path)
        {
            int err = 0;
            int warn = 0;

            ModelDoc2 swModel = this.swApp.OpenDoc6(path, (int)swDocumentTypes_e.swDocASSEMBLY, (int)swOpenDocOptions_e.swOpenDocOptions_Silent, "", err, warn);

            if (swModel == null)
                return false;
            if (err != 0)
                return false;

            swModel.ForceRebuild3(false);
            swModel.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, err, warn);
            return true;
        }


        public static bool ExportDrawing(string slddrwPath, string outPath)
        {
            var sw = new SldWorks();
            int err = 0, warn = 0;

            // Abre o desenho silenciosamente e como somente leitura
            var drw = sw.OpenDoc6(
                slddrwPath,
                (int)swDocumentTypes_e.swDocDRAWING,
                (int)(swOpenDocOptions_e.swOpenDocOptions_Silent | swOpenDocOptions_e.swOpenDocOptions_ReadOnly),
                "", ref err, ref warn);

            if (drw == null) return false;

            var model = (ModelDoc2)drw;
            var ext = model.Extension;
            string outExt = Path.GetExtension(outPath)?.ToLowerInvariant();
            object exportData = null;

            try
            {
                if (outExt == ".pdf")
                {
                    var pdfData = sw.GetExportFileData((int)swExportDataFileType_e.swExportPdfData) as ExportPdfData;
                    if (pdfData != null)
                    {
                        pdfData.ViewPdfAfterSaving = false;
                        pdfData.SetSheets((int)swExportDataSheetsToExport_e.swExportData_ExportAllSheets, null);
                        exportData = pdfData;
                    }
                }
                else if (outExt == ".dxf" || outExt == ".dwg")
                {
                    exportData = null;
                }
                else
                {
                    return false; // Extensão não suportada
                }

                // Executa o SaveAs
                // Importante: Para DXF/DWG, o SolidWorks usa as configurações atuais do sistema 
                // se o exportData for nulo ou limitado.
                bool ok = ext.SaveAs(
                    outPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    exportData, ref err, ref warn);

                return ok && err == 0;
            }
            finally
            {
                // Fecha o documento para liberar o arquivo e evitar o erro de "Exclusive Mode" no PDM
                sw.CloseDoc(model.GetTitle());
            }
        }

        //Retorna o nome da configuração.
        // null se a configuração já existe.
        string criarCFG(string parametro, int valor, string material)
        {
            string[] configs = (string[])this.model.GetConfigurationNames();

            //Verificar se já existe uma configuração com esse nome e valor
            foreach (string config in configs)
            {
                string[] confVal = config.Split(" ");
                if (confVal.Length < 3)
                    continue;

                if (confVal[0].Equals(parametro, StringComparison.OrdinalIgnoreCase)
                    && confVal[1].Equals(valor.ToString(), StringComparison.OrdinalIgnoreCase) &&
                     confVal[2].Equals(material, StringComparison.OrdinalIgnoreCase))
                {
                    return null;
                }
            }

            //Se não existe vá criar
            string nome = $"{parametro} {valor} {material}";
            this.model.AddConfiguration(nome, "", "", false, false, false, true, 0);

            return nome;
        }

        public void exportar(string savePath)
        {
            int errors = 0;
            int warnings = 0;
            ModelDocExtension swModelDocExt = this.model.Extension;
            // swSaveAsOptions_Silent (1) prevents dialog boxes from popping up
            bool status = swModelDocExt.SaveAs(
                savePath,
                (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                null,
                ref errors,
                ref warnings
            );

            if (status)
            {
                Console.WriteLine("Exportado.");
            }
        }
        public string pegarMaterial()
        {
            var swPart = this.model as PartDoc;
            if (swPart == null)
                return null;

            string databaseName = "";
            string materialName = swPart.GetMaterialPropertyName2("Default", out databaseName);

            if (!string.IsNullOrEmpty(materialName))
            {
                Debug.Print($"Material: {materialName}");
                Debug.Print($"Database: {databaseName}");
            }
            else
            {
                Debug.Print("No material applied.");
            }
            return null;
        }

        int trocarMaterial(int material, string arquivo)
        {
            return 0;
        }

        public void trocarMaterial(string material)
        {

        }

    }
}
