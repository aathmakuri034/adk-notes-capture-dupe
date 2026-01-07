import os
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
import json
from datetime import datetime

load_dotenv()

class AzureBlobStorage:
    def __init__(self, container_name=None):
        connection_string = os.getenv('AZURE_STORAGE_CONNECTION_STRING')
        if not connection_string:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRING not found in environment variables")
        
        # Use env variable if container_name not provided
        self.container_name = container_name or os.getenv('AZURE_CONTAINER_NAME')

        # Once Container has been created it should be something like. 
        # self.container_name = container_name or os.getenv('AZURE_CONTAINER_NAME', 'container_name)
        # This is so that if Azure Container name is not made, it falls back on default name

        self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)

        # Ensure container exists
        try:
            self.blob_service_client.create_container(self.container_name)
            print(f"✓ Container '{self.container_name}' created")
        except Exception as e:
            # Container already exists
            print(f"✓ Using existing container '{self.container_name}'")
    
    def upload_job_schema(self, job_data, filename=None):
        """
        Upload job schema JSON to job-schemas directory
        
        Args:
            job_data: Dictionary containing job schema data
            filename: Optional custom filename (without .json extension)
        
        Returns:
            blob_name: Full path of uploaded blob, or None if failed
        """
        try:
            # Generate filename if not provided
            if filename is None:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"job_schema_{timestamp}"
            
            # Ensure .json extension
            if not filename.endswith('.json'):
                filename = f"{filename}.json"
            
            # Organize by date
            date_folder = datetime.now().strftime("%Y-%m-%d")
            blob_name = f"job-schemas/{date_folder}/{filename}"
            
            # Upload to blob storage
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            json_data = json.dumps(job_data, indent=2, default=str)
            blob_client.upload_blob(json_data, overwrite=True)
            
            print(f"✓ Job schema uploaded: {blob_name}")
            return blob_name
        except Exception as e:
            print(f"✗ Error uploading job schema: {e}")
            return None
    
    def upload_transcript(self, transcript_text, filename=None):
        """
        Upload transcript text file to transcripts directory
        
        Args:
            transcript_text: String containing transcript content
            filename: Optional custom filename (without .txt extension)
        
        Returns:
            blob_name: Full path of uploaded blob, or None if failed
        """
        try:
            # Generate filename if not provided
            if filename is None:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"transcript_{timestamp}"
            
            # Ensure .txt extension
            if not filename.endswith('.txt'):
                filename = f"{filename}.txt"
            
            # Organize by date
            date_folder = datetime.now().strftime("%Y-%m-%d")
            blob_name = f"transcripts/{date_folder}/{filename}"
            
            # Upload to blob storage
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            blob_client.upload_blob(transcript_text, overwrite=True)
            
            print(f"✓ Transcript uploaded: {blob_name}")
            return blob_name
        except Exception as e:
            print(f"✗ Error uploading transcript: {e}")
            return None
    
    def download_job_schema(self, blob_name):
        """Download and parse job schema JSON"""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            blob_data = blob_client.download_blob().readall()
            return json.loads(blob_data)
        except Exception as e:
            print(f"✗ Error downloading job schema: {e}")
            return None
    
    def download_transcript(self, blob_name):
        """Download transcript text file"""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            transcript_text = blob_client.download_blob().readall().decode('utf-8')
            return transcript_text
        except Exception as e:
            print(f"✗ Error downloading transcript: {e}")
            return None
    
    def list_job_schemas(self, date=None):
        """List all job schemas, optionally filtered by date (YYYY-MM-DD)"""
        prefix = "job-schemas/"
        if date:
            prefix = f"job-schemas/{date}/"
        return self._list_blobs_by_prefix(prefix)
    
    def list_transcripts(self, date=None):
        """List all transcripts, optionally filtered by date (YYYY-MM-DD)"""
        prefix = "transcripts/"
        if date:
            prefix = f"transcripts/{date}/"
        return self._list_blobs_by_prefix(prefix)
    
    def _list_blobs_by_prefix(self, prefix):
        """Helper method to list blobs with a prefix"""
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_list = container_client.list_blobs(name_starts_with=prefix)
            return [blob.name for blob in blob_list]
        except Exception as e:
            print(f"✗ Error listing blobs: {e}")
            return []
    
    def delete_blob(self, blob_name):
        """Delete a blob from storage"""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            blob_client.delete_blob()
            print(f"✓ Deleted: {blob_name}")
            return True
        except Exception as e:
            print(f"✗ Error deleting blob: {e}")
            return False
    
    def upload_image(self, image_data, filename):
        """
        Upload image file to transcripts directory in Azure
        
        Args:
            image_data: Binary image data (bytes)
            filename: Image filename
            session_id: Session ID for organization
        
        Returns:
            blob_name: Full path of uploaded blob, or None if failed
        """
        try:
            # Organize by date, similar to local storage
            date_folder = datetime.now().strftime("%Y-%m-%d")
            blob_name = f"transcripts/{date_folder}/{filename}"
            
            # Upload to blob storage
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )

            blob_client.upload_blob(
                image_data,
                overwrite=True
            )
            
            print(f"✓ Image uploaded: {blob_name}")
            return blob_name
        except Exception as e:
            print(f"✗ Error uploading image: {e}")
            return None
    
    def upload_video(self, video_data, filename):
        """
        Upload video file to transcripts directory in Azure
        
        Args:
            video_data: Binary video data (bytes)
            filename: Video filename
            session_id: Session ID for organization
        
        Returns:
            blob_name: Full path of uploaded blob, or None if failed
        """
        try:
            # Organize by date, similar to local storage
            date_folder = datetime.now().strftime("%Y-%m-%d")
            blob_name = f"transcripts/{date_folder}/{filename}"
            
            # Upload to blob storage
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, 
                blob=blob_name
            )
            
            blob_client.upload_blob(video_data, overwrite=True)
            
            print(f"✓ Video uploaded: {blob_name}")
            return blob_name
        except Exception as e:
            print(f"✗ Error uploading video: {e}")
            return None