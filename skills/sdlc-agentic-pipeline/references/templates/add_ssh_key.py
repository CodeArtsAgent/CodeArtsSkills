import paramiko
import os
import sys

ECS_HOST = "<ECS_HOST>"
ECS_USER = "<ECS_USER>"
ECS_PASSWORD = "<ECS_PASSWORD>"

KNOWN_HOSTS_PATH = os.path.expanduser("~/.ssh/known_hosts")

def add_ssh_key():
    ssh = paramiko.SSHClient()
    if os.path.exists(KNOWN_HOSTS_PATH):
        ssh.load_host_keys(KNOWN_HOSTS_PATH)
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    print(f"Connecting to {ECS_USER}@{ECS_HOST}...")
    try:
        ssh.connect(ECS_HOST, username=ECS_USER, password=ECS_PASSWORD, timeout=15)
    except paramiko.SSHException as e:
        print(f"ERROR: Host key verification failed for {ECS_HOST}.")
        print(f"Verify the ECS host fingerprint first: ssh-keyscan {ECS_HOST} >> {KNOWN_HOSTS_PATH}")
        print(f"Then re-run this script.")
        sys.exit(1)

    pub_key_path = os.path.expanduser("~/.ssh/id_rsa.pub")
    if not os.path.exists(pub_key_path):
        print("ERROR: SSH public key not found at ~/.ssh/id_rsa.pub")
        print("Run ssh-keygen first, then re-run this script.")
        ssh.close()
        sys.exit(1)

    with open(pub_key_path, "r") as f:
        pub_key = f.read().strip()

    cmd = 'mkdir -p ~/.ssh && echo "{}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo SUCCESS'.format(pub_key)
    stdin, stdout, stderr = ssh.exec_command(cmd)
    result = stdout.read().decode().strip()
    err = stderr.read().decode().strip()

    if result == "SUCCESS":
        print("SSH public key added to ECS successfully.")
    else:
        print("ERROR: Failed to add SSH key.")
        if err:
            print("STDERR:", err)
        ssh.close()
        sys.exit(1)

    ssh.close()

    # Verify key-based login works
    print("Verifying key-based SSH login...")
    import subprocess
    ssh_key = os.path.expanduser("~/.ssh/id_rsa")
    verify = subprocess.run(
        ["ssh", "-i", ssh_key, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
         "-o", "ConnectTimeout=10", f"{ECS_USER}@{ECS_HOST}", "echo VERIFIED"],
        capture_output=True, text=True, timeout=15
    )
    if verify.returncode == 0 and "VERIFIED" in verify.stdout:
        print("Key-based SSH login verified successfully.")
    else:
        print("WARNING: Key-based login verification failed.")
        print(verify.stderr)

if __name__ == "__main__":
    add_ssh_key()
