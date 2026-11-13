"""Local publication preflight must validate bytes without touching GitHub."""
import importlib.util,json,tempfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('notka_publish',Path('../scripts/publish.py'))
publisher=importlib.util.module_from_spec(spec);spec.loader.exec_module(publisher)
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);(root/'bad.apk').write_bytes(b'damaged')
    manifest={'repository':publisher.REPO,'releases':[{'tag':'apk-70','assets':[{'name':'Notka-70.apk','path':'bad.apk','bytes':7,'sha256':'0'*64}]}]}
    (root/'publication.json').write_text(json.dumps(manifest))
    with patch.object(publisher,'verified_catalogs',return_value={'code':70}),patch.object(publisher.subprocess,'run',side_effect=AssertionError('Preflight must not invoke GitHub')):
        try:publisher.publish(root,True)
        except ValueError as error:assert 'hash mismatch' in str(error)
        else:raise AssertionError('Damaged asset passed verification')
        import hashlib,base64
        blob=(root/'bad.apk').read_bytes();digest=hashlib.sha256(blob)
        manifest['releases'][0]['assets'][0]['sha256']=digest.hexdigest()
        (root/'publication.json').write_text(json.dumps(manifest))
        with patch.object(publisher,'verified_catalogs',return_value={'code':70,'sha256':base64.b64encode(digest.digest()).decode()}):publisher.publish(root,True)
    # Release publication must finish before the live snapshot is activated.
    from types import SimpleNamespace
    manifest['update_branch']='updates'
    manifest['releases'][0].update(title='Fixture',notes='Fixture',latest=True)
    (root/'publication.json').write_text(json.dumps(manifest))
    events=[]
    def fake_gh(*args):
        events.append(args)
        return '[]' if args[:2]==('release','list') else ''
    def fake_run(args,**kwargs):
        events.append(tuple(args))
        return SimpleNamespace(returncode=1 if args[:3]==['gh','release','view'] else 0,stdout='')
    with patch.object(publisher,'verified_catalogs',return_value={'code':70,'sha256':base64.b64encode(digest.digest()).decode()}),patch.object(publisher,'gh',side_effect=fake_gh),patch.object(publisher.subprocess,'run',side_effect=fake_run),patch.object(publisher.subprocess,'check_output',return_value='[]'),patch.dict(publisher.os.environ,{'NOTKA_RELEASE_COMMIT':'a'*40}):
        publisher.publish(root)
        published=next(i for i,x in enumerate(events) if x[:2]==('release','edit'))
        activated=next(i for i,x in enumerate(events) if x[:2]==('gh','api'))
        assert published<activated and 'ref=refs/heads/updates' in events[activated]
        events.clear()
        def fail_upload(*args):
            if args[:2]==('release','upload'):raise RuntimeError('Upload failed')
            return fake_gh(*args)
        with patch.object(publisher,'gh',side_effect=fail_upload):
            try:publisher.publish(root)
            except RuntimeError:pass
            else:raise AssertionError('Upload failure ignored')
        assert not any(x[:2]==('gh','api') for x in events)
print('PASS publication preflight rejects corrupted local assets, accepts matching bytes and never contacts GitHub.')
print('PASS update snapshot activates after release publication; failed upload leaves the active branch untouched.')
